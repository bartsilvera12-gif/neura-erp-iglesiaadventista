-- ============================================================================
-- Crear schema `iglesiaadventista` clonando estructura de `ferrecolor`
-- ============================================================================
-- SOLO LECTURA sobre ferrecolor (SELECT en information_schema/pg_catalog +
-- LIKE / pg_get_*). No escribe en ferrecolor. Todo dentro de una transaccion:
-- si algo falla, ROLLBACK y no queda basura.
--
-- Uso: pegar completo en Supabase SQL Editor y ejecutar.
-- Despues: agregar `iglesiaadventista` en Exposed Schemas (API settings).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Schema nuevo
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS iglesiaadventista;

-- ---------------------------------------------------------------------------
-- 2) Clonar tablas (columnas, defaults, NOT NULL, PK, UNIQUE, CHECK, indices)
--    LIKE INCLUDING ALL NO trae FKs, triggers, ni RLS: eso va despues.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='ferrecolor' LOOP
    EXECUTE format(
      'CREATE TABLE iglesiaadventista.%I (LIKE ferrecolor.%I INCLUDING ALL)',
      r.tablename, r.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Foreign Keys (apuntando a las tablas nuevas del schema)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT cl.relname AS t, c.conname AS n, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname='ferrecolor' AND c.contype='f'
  LOOP
    EXECUTE format(
      'ALTER TABLE iglesiaadventista.%I ADD CONSTRAINT %I %s',
      r.t, r.n,
      replace(r.def, 'REFERENCES ferrecolor.', 'REFERENCES iglesiaadventista.')
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Funciones del schema
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='ferrecolor'
  LOOP
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'ferrecolor.', 'iglesiaadventista.');
    EXECUTE def;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Views
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT viewname, definition FROM pg_views WHERE schemaname='ferrecolor' LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW iglesiaadventista.%I AS %s',
      r.viewname,
      replace(r.definition, 'ferrecolor.', 'iglesiaadventista.')
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname='ferrecolor' AND NOT t.tgisinternal
  LOOP
    EXECUTE replace(r.def, 'ON ferrecolor.', 'ON iglesiaadventista.');
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7) Habilitar RLS en las tablas que lo tienen habilitado en ferrecolor
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname='ferrecolor' AND c.relkind='r' AND c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE iglesiaadventista.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8) RLS Policies
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; q text; wc text;
BEGIN
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='ferrecolor' LOOP
    q  := COALESCE(replace(r.qual,       'ferrecolor.', 'iglesiaadventista.'), '');
    wc := COALESCE(replace(r.with_check, 'ferrecolor.', 'iglesiaadventista.'), '');
    EXECUTE format(
      'CREATE POLICY %I ON iglesiaadventista.%I AS %s FOR %s TO %s %s %s',
      r.policyname, r.tablename,
      CASE WHEN r.permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      array_to_string(r.roles, ','),
      CASE WHEN q  <> '' THEN 'USING ('||q||')' ELSE '' END,
      CASE WHEN wc <> '' THEN 'WITH CHECK ('||wc||')' ELSE '' END
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9) GRANTS: espejar los de ferrecolor
-- ---------------------------------------------------------------------------

-- 9a) USAGE / CREATE a nivel de schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT grantee, privilege_type
    FROM information_schema.usage_privileges
    WHERE object_schema='ferrecolor' AND object_type='SCHEMA'
  LOOP
    EXECUTE format('GRANT %s ON SCHEMA iglesiaadventista TO %I',
      r.privilege_type, r.grantee);
  END LOOP;
END $$;

-- 9b) Grants sobre tablas y vistas
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT grantee, privilege_type, table_name
    FROM information_schema.role_table_grants
    WHERE table_schema='ferrecolor' AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT %s ON iglesiaadventista.%I TO %I',
      r.privilege_type, r.table_name, r.grantee);
  END LOOP;
END $$;

-- 9c) Grants sobre secuencias
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT grantee, privilege_type, object_name AS seq
    FROM information_schema.usage_privileges
    WHERE object_schema='ferrecolor' AND object_type='SEQUENCE'
      AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT %s ON SEQUENCE iglesiaadventista.%I TO %I',
      r.privilege_type, r.seq, r.grantee);
  END LOOP;
END $$;

-- 9d) Grants sobre funciones (con firma exacta para manejar overloads)
DO $$
DECLARE r record; sig text;
BEGIN
  FOR r IN
    SELECT p.oid, rl.rolname AS grantee, a.privilege_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace,
    LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    JOIN pg_roles rl ON rl.oid = a.grantee
    WHERE n.nspname='ferrecolor' AND p.proacl IS NOT NULL
  LOOP
    sig := replace(r.oid::regprocedure::text, 'ferrecolor.', 'iglesiaadventista.');
    EXECUTE format('GRANT %s ON FUNCTION %s TO %I',
      r.privilege_type, sig, r.grantee);
  END LOOP;
END $$;

-- 9e) Default privileges (para objetos futuros — migraciones nuevas)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT
      d.defaclobjtype AS objtype,
      rl.rolname AS grantee,
      a.privilege_type
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace,
    LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles rl ON rl.oid = a.grantee
    WHERE n.nspname='ferrecolor'
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA iglesiaadventista GRANT %s ON %s TO %I',
      r.privilege_type,
      CASE r.objtype WHEN 'r' THEN 'TABLES'
                     WHEN 'S' THEN 'SEQUENCES'
                     WHEN 'f' THEN 'FUNCTIONS'
                     WHEN 'T' THEN 'TYPES' END,
      r.grantee
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10) Insertar la empresa
-- ---------------------------------------------------------------------------
INSERT INTO iglesiaadventista.empresas (id, nombre_empresa, data_schema)
VALUES (gen_random_uuid(), 'IGLESIA ADVENTISTA DE LA PROMESA', 'iglesiaadventista');

-- ---------------------------------------------------------------------------
-- 11) Copiar los mismos modulos habilitados que tiene ferrecolor
-- ---------------------------------------------------------------------------
INSERT INTO iglesiaadventista.empresa_modulos (empresa_id, modulo, activo)
SELECT
  (SELECT id FROM iglesiaadventista.empresas WHERE data_schema='iglesiaadventista' LIMIT 1),
  em.modulo,
  em.activo
FROM ferrecolor.empresa_modulos em
JOIN ferrecolor.empresas e ON e.id = em.empresa_id
WHERE e.data_schema='ferrecolor';

COMMIT;

-- ============================================================================
-- VERIFICACION (correr despues del COMMIT)
-- ============================================================================

-- Resumen del nuevo schema
SELECT
  (SELECT count(*) FROM information_schema.tables    WHERE table_schema='iglesiaadventista') AS tablas,
  (SELECT count(*) FROM information_schema.views     WHERE table_schema='iglesiaadventista') AS vistas,
  (SELECT count(*) FROM information_schema.routines  WHERE routine_schema='iglesiaadventista') AS funciones,
  (SELECT count(*) FROM pg_policies                  WHERE schemaname='iglesiaadventista')  AS policies,
  (SELECT count(*) FROM iglesiaadventista.empresas)         AS empresas,
  (SELECT count(*) FROM iglesiaadventista.empresa_modulos)  AS modulos;

-- Comparar count por objeto vs ferrecolor (todo cero = identico)
SELECT 'tablas'    AS tipo,
  (SELECT count(*) FROM information_schema.tables   WHERE table_schema='ferrecolor')       -
  (SELECT count(*) FROM information_schema.tables   WHERE table_schema='iglesiaadventista') AS diff
UNION ALL SELECT 'vistas',
  (SELECT count(*) FROM information_schema.views    WHERE table_schema='ferrecolor')       -
  (SELECT count(*) FROM information_schema.views    WHERE table_schema='iglesiaadventista')
UNION ALL SELECT 'funciones',
  (SELECT count(*) FROM information_schema.routines WHERE routine_schema='ferrecolor')     -
  (SELECT count(*) FROM information_schema.routines WHERE routine_schema='iglesiaadventista')
UNION ALL SELECT 'policies',
  (SELECT count(*) FROM pg_policies WHERE schemaname='ferrecolor')                          -
  (SELECT count(*) FROM pg_policies WHERE schemaname='iglesiaadventista');

-- Grants faltantes (deberia salir vacio)
SELECT grantee, privilege_type, table_name
FROM information_schema.role_table_grants
WHERE table_schema='ferrecolor' AND grantee <> 'PUBLIC'
EXCEPT
SELECT grantee, privilege_type, table_name
FROM information_schema.role_table_grants
WHERE table_schema='iglesiaadventista' AND grantee <> 'PUBLIC';

-- ============================================================================
-- POST-SCRIPT (fuera de SQL):
--   1) Supabase Dashboard -> Settings -> API -> Exposed schemas:
--      agregar `iglesiaadventista`.
--   2) Crear usuario admin (auth.users + iglesiaadventista.usuarios).
--   3) Coolify: env NEURA_CLIENT_SCHEMA=iglesiaadventista.
-- ============================================================================
