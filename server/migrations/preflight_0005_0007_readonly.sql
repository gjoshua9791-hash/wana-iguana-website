-- preflight_0005_0007_readonly.sql
-- READ-ONLY preflight for migrations 0005-0007 against the SHARED Supabase DB.
-- Run as the migration OPERATOR (postgres). SELECT-only: it creates/alters/drops
-- NOTHING, writes no rows, and changes no permissions. Safe to run repeatedly.
--
-- STATUS: the 0005-0007 rollout is now COMPLETE (ledger = 0001-0007). This script
-- is retained as the reusable pre/post-rollout read-only check. Note the
-- expectations FLIP after rollout: section A now lists 0001-0007; section B now
-- LISTS the four new columns (they exist); section E now LISTS the seeded ids
-- (they exist); section F lists the expanded shared 'protein' group (5 options)
-- and its linked variants (suave/bravo/supreme). Pre-rollout, A had only 0001-0004
-- and B/E returned zero rows. Contains placeholders only — no secrets.
--
-- Usage (operator; password via a hidden prompt, NOT in the URL/args/history):
--   read -s -p "operator DB password: " PGPASSWORD; echo; export PGPASSWORD
--   /Applications/Postgres.app/Contents/Versions/latest/bin/psql \
--     "postgresql://postgres@POOLER_HOST:5432/postgres?sslmode=verify-full&sslrootcert=/abs/path/prod-ca.crt" \
--     -X -v ON_ERROR_STOP=1 -f server/migrations/preflight_0005_0007_readonly.sql
--   unset PGPASSWORD
-- (Replace POOLER_HOST and the CA path with your operator values; nothing here
--  prints the password.)

\echo '== A. ledger: expect 0001-0004 present, 0005-0007 ABSENT =='
SELECT filename FROM public.schema_migrations ORDER BY filename;

\echo '== B. 0005/0006 columns must NOT already exist (expect zero rows) =='
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND ( (table_name='menu_item'              AND column_name IN ('category','sort_order'))
     OR (table_name='modifier_option'        AND column_name='double_meat_available')
     OR (table_name='variant_modifier_group' AND column_name='double_meat_price_delta_cents') )
ORDER BY table_name, column_name;

\echo '== C. Taco Suave item + default variant: expect active / 525 =='
SELECT mi.id, mi.name, mi.is_active AS item_active,
       iv.id AS variant_id, iv.base_price_cents, iv.is_default, iv.is_active AS variant_active
FROM public.menu_item mi
JOIN public.item_variant iv ON iv.item_id = mi.id
WHERE mi.id='taco-suave';

\echo '== D. Taco Suave protein group/options via the default variant (expect steak/chicken, delta 0, min/max 1/1) =='
SELECT mg.id AS group_id, mg.label, vmg.min_select, vmg.max_select,
       mo.id AS option_id, mo.name AS option_name, mo.price_delta_cents, mo.sort_order
FROM public.item_variant iv
JOIN public.variant_modifier_group vmg ON vmg.variant_id = iv.id
JOIN public.modifier_group mg          ON mg.id = vmg.group_id
LEFT JOIN public.modifier_option mo    ON mo.group_id = mg.id
WHERE iv.id='taco-suave-base'
ORDER BY vmg.sort_order, mo.sort_order;

\echo '== E. 0007 identifier COLLISION check: any of these already present is UNEXPECTED (expect zero rows each) =='
\echo '-- E1. menu_item ids 0007 inserts'
SELECT id FROM public.menu_item
 WHERE id IN ('taco-duro','taco-bravo','taco-del-mar','taco-supreme');
\echo '-- E2. item_variant ids 0007 inserts'
SELECT id FROM public.item_variant
 WHERE id IN ('taco-duro-base','taco-bravo-base','taco-del-mar-base','taco-supreme-base');
\echo '-- E3. modifier_group ids 0007 inserts'
SELECT id FROM public.modifier_group
 WHERE id IN ('protein-duro','protein-seafood');
\echo '-- E4. modifier_option ids 0007 inserts (the three new shared + duro + seafood)'
SELECT id, group_id FROM public.modifier_option
 WHERE id IN ('shredded-beef','shredded-chicken','grilled-veggies',
              'duro-shredded-chicken','duro-shredded-beef','grilled-fish','grilled-shrimp');
\echo '-- E5. variant_modifier_group links 0007 inserts (expect zero rows)'
SELECT variant_id, group_id FROM public.variant_modifier_group
 WHERE (variant_id,group_id) IN (
   ('taco-bravo-base','protein'), ('taco-supreme-base','protein'),
   ('taco-duro-base','protein-duro'), ('taco-del-mar-base','protein-seafood'));

\echo '== F. shared protein group usage: which variants link to protein? 0007 EXPANDS this group =='
\echo '-- F1. variants currently linked to the shared protein group (expect only taco-suave-base pre-rollout)'
SELECT vmg.variant_id, iv.item_id, iv.is_default, iv.is_active
FROM public.variant_modifier_group vmg
JOIN public.item_variant iv ON iv.id = vmg.variant_id
WHERE vmg.group_id='protein'
ORDER BY vmg.variant_id;
\echo '-- F2. options currently in the shared protein group (expect only steak, chicken pre-rollout)'
SELECT id, name, price_delta_cents, sort_order FROM public.modifier_option
 WHERE group_id='protein' ORDER BY sort_order, id;

\echo '== G. current_user sanity (should be the operator role, e.g. postgres) =='
SELECT current_user;
