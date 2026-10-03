-- ============================================================================
-- Aportantes: cédula + filial, y semilla de tipos de aporte (Diezmo/Ofrenda/Voto)
-- ----------------------------------------------------------------------------
-- IMPORTANTE: las tablas operativas de iglesia (aportantes, filiales,
-- categorias_ingreso) viven en el SCHEMA DE DATOS del cliente, NO en `public`.
--
-- SET search_path TO ferreteriarepublica;  -- ← ajustá al schema del cliente

alter table aportantes add column if not exists cedula text;
alter table aportantes add column if not exists filial_id uuid references filiales(id);

create unique index if not exists aportantes_cedula_empresa_uidx
  on aportantes (empresa_id, cedula)
  where cedula is not null and cedula <> '';

create index if not exists aportantes_filial_idx on aportantes (filial_id);

insert into categorias_ingreso (empresa_id, nombre, orden, activo)
select distinct f.empresa_id, v.nombre, v.orden, true
from filiales f
cross join (values
  ('DIEZMO', 1),
  ('OFRENDA ESCUELA BIBLICA', 2),
  ('OFRENDA DEL CULTO', 3),
  ('VOTOS', 4)
) as v(nombre, orden)
where not exists (
  select 1 from categorias_ingreso c
  where c.empresa_id = f.empresa_id
    and upper(c.nombre) = v.nombre
);
