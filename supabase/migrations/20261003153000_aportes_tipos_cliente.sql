-- Asegura los tres tipos de aporte solicitados por el cliente sin borrar históricos.
-- Idempotente: no elimina categorías anteriores ni movimientos existentes.

insert into categorias_ingreso (empresa_id, nombre, orden, activo)
select distinct f.empresa_id, v.nombre, v.orden, true
from filiales f
cross join (values
  ('DIEZMO', 1),
  ('OFRENDA', 2),
  ('VOTO', 3)
) as v(nombre, orden)
where not exists (
  select 1
  from categorias_ingreso c
  where c.empresa_id = f.empresa_id
    and upper(trim(c.nombre)) = v.nombre
);
