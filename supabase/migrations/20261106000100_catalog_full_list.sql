-- The starting catalog, from the owner's full list of what their sites buy (2026-10-19): sand by
-- source, block, stone by size and for cladding, tile, granite, GI and MS pipe, windows and doors,
-- putty and paint, with the units they are bought in (sq.ft, litre, running ft) and three more
-- material headings, so finishing costs do not all land in Hardware.
--
-- private.add_catalog_items adds whatever a company is missing and never renames or duplicates:
-- a unit is matched by code, a heading by name under Materials, a material by any of its names
-- (a company made before this keeps "Sand" and "Stone"; they count as Sand (masino) and Stone
-- (small)). New companies get it through seed_company_defaults; existing ones below.

create function private.add_catalog_items(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_materials uuid;
  r record;
begin
  insert into public.units (company_id, code, name)
  select p_company, u.code, u.name
  from (values ('sqft', 'Sq.ft'), ('litre', 'Litre'), ('rft', 'Running ft')) u (code, name)
  where not exists (select 1 from public.units x where x.company_id = p_company and x.code = u.code);

  select id into v_materials from public.cost_headings
  where company_id = p_company and parent_id is null and kind = 'materials'
  order by sort_order limit 1;
  if v_materials is null then
    return; -- a company that removed its Materials heading keeps its own catalog
  end if;

  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order)
  select p_company, v_materials, h.name, 'materials', h.sort_order
  from (values ('Tiles and stone finish', 8), ('Doors and windows', 9), ('Color', 10)) h (name, sort_order)
  where not exists (select 1 from public.cost_headings x
    where x.company_id = p_company and x.parent_id = v_materials and lower(x.name) = lower(h.name));

  for r in
    select m.* from (values
      (1, array['Rod (TMT rebar)'], 'Chhad', 'kg', 'Rod/Steel'),
      (2, array['Cement'], 'Cement', 'bag', 'Cement'),
      (3, array['Sand (masino)', 'Sand'], 'Masino baluwa', 'cft', 'Baluwa/Gitti/Dhunga'),
      (4, array['Sand (crusher)'], 'Crusher baluwa', 'cft', 'Baluwa/Gitti/Dhunga'),
      (5, array['Aggregate'], 'Gitti', 'cft', 'Baluwa/Gitti/Dhunga'),
      (6, array['Brick'], 'Eeta', 'piece', 'Bricks'),
      (7, array['Block'], 'Block', 'piece', 'Bricks'),
      (8, array['Stone (small)', 'Stone'], 'Dhunga', 'cft', 'Baluwa/Gitti/Dhunga'),
      (9, array['Stone (large)'], 'Thulo dhunga', 'cft', 'Baluwa/Gitti/Dhunga'),
      (10, array['Stone (cladding)'], null, 'sqft', 'Tiles and stone finish'),
      (11, array['Tile'], 'Tile', 'sqft', 'Tiles and stone finish'),
      (12, array['Granite'], 'Granite', 'sqft', 'Tiles and stone finish'),
      (13, array['GI pipe'], null, 'rft', 'Plumbing'),
      (14, array['MS pipe'], null, 'kg', 'Rod/Steel'),
      (15, array['UPVC window/door'], null, 'sqft', 'Doors and windows'),
      (16, array['Aluminium window/door'], null, 'sqft', 'Doors and windows'),
      (17, array['Wooden window/door'], null, 'piece', 'Doors and windows'),
      (18, array['Color (putty)'], 'Putty', 'kg', 'Color'),
      (19, array['Color (primer / paint)'], 'Rang', 'litre', 'Color'),
      (20, array['Electrical items'], null, 'piece', 'Electrical'),
      (21, array['Plumbing items'], null, 'piece', 'Plumbing'),
      (22, array['Metal / hardware'], null, 'kg', 'Hardware')
    ) m (n, names, local_name, unit, heading)
    order by m.n
  loop
    continue when exists (select 1 from public.materials x
      where x.company_id = p_company and lower(x.name) = any (select lower(unnest(r.names))));
    insert into public.materials (company_id, name, local_name, default_unit_id, default_heading_id)
    select p_company, r.names[1], r.local_name, u.id,
      (select h.id from public.cost_headings h
       where h.company_id = p_company and h.parent_id = v_materials and lower(h.name) = lower(r.heading) limit 1)
    from public.units u
    where u.company_id = p_company and u.code = r.unit;
  end loop;
end $$;
revoke execute on function private.add_catalog_items(uuid) from public, anon, authenticated;

-- New companies: the original headings and units, then the full list.
create or replace function private.seed_company_defaults(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h_materials uuid; h_subcontract uuid;
  i integer := 0;
  v_name text;
begin
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Materials', 'materials', 10) returning id into h_materials;
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Own Labour (Jyala)', 'labour', 20);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Subcontract Work', 'subcontract', 30) returning id into h_subcontract;
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Equipment / Machinery Hire', 'equipment', 40);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Transport and Delivery', 'transport', 50);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Site Expenses', 'site', 60);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Other', 'other', 70);

  foreach v_name in array array['Cement', 'Rod/Steel', 'Baluwa/Gitti/Dhunga', 'Bricks', 'Hardware', 'Electrical', 'Plumbing'] loop
    i := i + 1;
    insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, v_name, 'materials', i);
  end loop;
  i := 0;
  foreach v_name in array array['Plaster', 'Masonry', 'Electrical', 'Plumbing', 'Painting', 'Tiling', 'Shuttering'] loop
    i := i + 1;
    insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_subcontract, v_name, 'subcontract', i);
  end loop;

  insert into public.units (company_id, code, name) values
    (p_company, 'bag', 'Bora (bag)'), (p_company, 'kg', 'Kg'), (p_company, 'quintal', 'Quintal'), (p_company, 'tonne', 'Tonne'),
    (p_company, 'bundle', 'Bundle'), (p_company, 'thousand', 'Thousand'), (p_company, 'meter', 'Meter'), (p_company, 'coil', 'Coil'),
    (p_company, 'cft', 'Cft'), (p_company, 'piece', 'Piece');
  insert into public.units (company_id, code, name, needs_note) values (p_company, 'trip', 'Trip', true), (p_company, 'load', 'Load', true);

  perform private.add_catalog_items(p_company);
end $$;

-- Existing companies: what they are missing.
do $$
declare c uuid;
begin
  for c in select id from public.companies loop
    perform private.add_catalog_items(c);
  end loop;
end $$;
