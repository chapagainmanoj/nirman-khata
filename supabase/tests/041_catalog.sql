-- The starting catalog from the owner's full list (2026-10-19): what a new company gets, that every
-- default points at its own company's unit and heading, and that adding the list to a company made
-- before it fills only the gaps: nothing renamed, nothing twice.
begin;
\ir helpers/helpers.psql
select plan(8);

select tests.create_user('owner') as owner \gset
select tests.create_company('Suchi Nirman', :'owner') as co \gset

select set_eq($$select name from public.materials where company_id = '$$ || :'co' || $$'$$,
  array['Rod (TMT rebar)', 'Cement', 'Sand (masino)', 'Sand (crusher)', 'Aggregate', 'Brick', 'Block', 'Stone (small)',
    'Stone (large)', 'Stone (cladding)', 'Tile', 'Granite', 'GI pipe', 'MS pipe', 'UPVC window/door',
    'Aluminium window/door', 'Wooden window/door', 'Color (putty)', 'Color (primer / paint)', 'Electrical items',
    'Plumbing items', 'Metal / hardware'],
  'a new company gets the full list');
select set_eq($$select h.name from public.cost_headings h join public.cost_headings p on p.id = h.parent_id
  where h.company_id = '$$ || :'co' || $$' and p.name = 'Materials'$$,
  array['Cement', 'Rod/Steel', 'Baluwa/Gitti/Dhunga', 'Bricks', 'Hardware', 'Electrical', 'Plumbing',
    'Tiles and stone finish', 'Doors and windows', 'Color'],
  '... ten material headings');
select results_eq($$select m.name, u.code, h.name from public.materials m join public.units u on u.id = m.default_unit_id
  join public.cost_headings h on h.id = m.default_heading_id
  where m.company_id = '$$ || :'co' || $$' and m.name in ('Tile', 'GI pipe', 'Color (primer / paint)') order by m.name$$,
  $$values ('Color (primer / paint)', 'litre', 'Color'), ('GI pipe', 'rft', 'Plumbing'), ('Tile', 'sqft', 'Tiles and stone finish')$$,
  '... each bought in its own unit, under its heading');
select is((select count(*) from public.materials m
  left join public.units u on u.id = m.default_unit_id and u.company_id = m.company_id
  left join public.cost_headings h on h.id = m.default_heading_id and h.company_id = m.company_id
  where m.company_id = :'co' and (u.id is null or h.id is null)), 0::bigint,
  'every default unit and heading is the company''s own');

-- Again: nothing more.
select private.add_catalog_items(:'co');
select is((select count(*) from public.materials where company_id = :'co'), 22::bigint, 'adding the list again adds nothing');
select is((select count(*) from public.units where company_id = :'co'), 15::bigint, '... no unit twice');

-- A company made before the list: "Sand" and "Stone", no crusher sand, no Color heading.
update public.materials set name = 'Sand' where company_id = :'co' and name = 'Sand (masino)';
update public.materials set name = 'Stone' where company_id = :'co' and name = 'Stone (small)';
delete from public.materials where company_id = :'co' and name in ('Sand (crusher)', 'Color (putty)', 'Color (primer / paint)');
delete from public.cost_headings where company_id = :'co' and name = 'Color';
select private.add_catalog_items(:'co');
select set_eq($$select name from public.materials where company_id = '$$ || :'co' || $$' and name ilike any (array['sand%', 'stone (small)', 'stone', 'color%'])$$,
  array['Sand', 'Sand (crusher)', 'Stone', 'Color (putty)', 'Color (primer / paint)'],
  'an older company gets what it lacks; its Sand and Stone keep their names and are not added again');
select is((select count(*) from public.cost_headings where company_id = :'co' and name = 'Color'), 1::bigint,
  '... and the missing heading, once');

select * from finish();
rollback;
