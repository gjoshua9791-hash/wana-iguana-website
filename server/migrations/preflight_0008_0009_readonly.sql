-- preflight_0008_0009_readonly.sql
-- READ-ONLY preflight for migrations 0008 (double-portion column) and 0009
-- (seed Burritos) against the SHARED Supabase DB. Run as the migration OPERATOR
-- (postgres). SELECT-only: it creates/alters/drops NOTHING, writes no rows, and
-- changes no permissions or RLS. Safe to run repeatedly. Contains placeholders
-- only — no secrets.
--
-- PURPOSE: confirm the shared dev DB is at the expected PRE-rollout baseline
-- before 0008/0009 are ever applied. Expectations below are the PRE-rollout
-- state (ledger 0001-0007; the 0008 column ABSENT; none of the 0009 ids present;
-- Original Tacos untouched). After rollout the expectations FLIP (A lists
-- 0001-0009; B lists the column; E lists the seeded ids) — do not re-run this as
-- a post-rollout check without re-reading each \echo.
--
-- IF REALITY DIFFERS FROM AN EXPECTATION: STOP. Do not apply, delete, or
-- overwrite anything. Investigate (see server/migrations/VERIFICATION notes and
-- design.md §6a) and resolve the discrepancy before any apply. A collision in
-- section E, a non-0001-0007 ledger in A, or an already-present column in B all
-- mean the DB is not in the assumed state.
--
-- Usage (operator; password via a HIDDEN prompt, NEVER in the URL/args/history):
--   read -rs "?operator DB password: " PGPASSWORD; echo; export PGPASSWORD
--   /Applications/Postgres.app/Contents/Versions/latest/bin/psql \
--     "postgresql://postgres@POOLER_HOST:5432/postgres?sslmode=verify-full&sslrootcert=/abs/path/prod-ca.crt" \
--     -X -v ON_ERROR_STOP=1 -f server/migrations/preflight_0008_0009_readonly.sql
--   unset PGPASSWORD
-- (Replace POOLER_HOST and the CA path with your operator values. verify-full +
--  sslrootcert keep the verified-TLS chain. Nothing here prints the password.)

\echo '== A. ledger: expect EXACTLY 0001-0007 present, 0008/0009 ABSENT =='
SELECT filename FROM public.schema_migrations ORDER BY filename;
\echo '-- A2. count must be 7; 0008/0009 must NOT appear (expect zero rows) --'
SELECT count(*) AS ledger_count FROM public.schema_migrations;
SELECT filename FROM public.schema_migrations
 WHERE filename IN ('0008_double_portion_column.sql','0009_seed_burritos.sql');

\echo '== B. 0008 column must NOT already exist (expect zero rows) =='
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='modifier_option'
  AND column_name='double_portion_price_delta_cents';

\echo '== C. 0009 menu_item id COLLISION check (any row here is UNEXPECTED; expect zero) =='
SELECT id, name, category FROM public.menu_item
 WHERE id IN ('fajita-burrito','super-burrito','burrito-grande','bravo-burrito',
              'burrito-del-mar','grilled-fish-burrito','classic-burrito')
 ORDER BY id;
\echo '-- C2. any item already in category burritos is UNEXPECTED (expect zero rows) --'
SELECT id, name FROM public.menu_item WHERE category='burritos' ORDER BY id;

\echo '== D. 0009 item_variant id COLLISION check (expect zero rows) =='
SELECT id, item_id FROM public.item_variant
 WHERE id IN ('fajita-burrito-base','super-burrito-base','burrito-grande-base',
              'bravo-burrito-base','burrito-del-mar-base','grilled-fish-burrito-base',
              'classic-burrito-base')
 ORDER BY id;

\echo '== E. 0009 modifier_group id COLLISION check (expect zero rows) =='
SELECT id, name FROM public.modifier_group
 WHERE id IN ('burrito-protein','classic-protein','delmar-extra','fish-extra','wet-upgrade')
 ORDER BY id;

\echo '== F. 0009 modifier_option id COLLISION check (all 15; expect zero rows) =='
SELECT id, group_id FROM public.modifier_option
 WHERE id IN ('burrito-steak','burrito-chicken','burrito-shredded-beef',
              'burrito-shredded-chicken','burrito-grilled-veggies',
              'classic-grilled-veggies','classic-steak','classic-chicken',
              'classic-shredded-beef','classic-shredded-chicken',
              'classic-grilled-fish','classic-grilled-shrimp',
              'extra-shrimp','extra-fish','wet')
 ORDER BY id;

\echo '== G. 0009 variant<->group link COLLISION check (expect zero rows) =='
SELECT variant_id, group_id FROM public.variant_modifier_group
 WHERE (variant_id, group_id) IN (
   ('fajita-burrito-base','burrito-protein'), ('fajita-burrito-base','wet-upgrade'),
   ('super-burrito-base','burrito-protein'),  ('super-burrito-base','wet-upgrade'),
   ('burrito-grande-base','burrito-protein'), ('burrito-grande-base','wet-upgrade'),
   ('bravo-burrito-base','burrito-protein'),  ('bravo-burrito-base','wet-upgrade'),
   ('burrito-del-mar-base','delmar-extra'),   ('burrito-del-mar-base','wet-upgrade'),
   ('grilled-fish-burrito-base','fish-extra'),('grilled-fish-burrito-base','wet-upgrade'),
   ('classic-burrito-base','classic-protein'),('classic-burrito-base','wet-upgrade'))
 ORDER BY variant_id, group_id;

\echo '== H. Original Tacos BASELINE — must match pre-rollout expected values =='
\echo '-- H1. five Original Tacos present & active, in display order (expect exactly these five) --'
SELECT id, name, is_active, sort_order
FROM public.menu_item
WHERE category='original-tacos' AND is_active
ORDER BY sort_order, id;
\echo '-- H2. default-variant base prices (expect suave 525; the rest unchanged from 0007) --'
SELECT iv.item_id, iv.id AS variant_id, iv.base_price_cents, iv.is_default, iv.is_active
FROM public.item_variant iv
JOIN public.menu_item mi ON mi.id = iv.item_id
WHERE mi.category='original-tacos' AND iv.is_default AND iv.is_active
ORDER BY mi.sort_order, iv.item_id;
\echo '-- H3. shared protein group options (expect exactly these 5, all price_delta 0) --'
SELECT id, name, price_delta_cents, sort_order, double_meat_available
FROM public.modifier_option
WHERE group_id='protein'
ORDER BY sort_order, id;
\echo '-- H4. double-meat surcharge per taco variant (expect suave 150, bravo 150, supreme 299, duro NULL, del-mar NULL) --'
SELECT vmg.variant_id, vmg.group_id, vmg.min_select, vmg.max_select,
       vmg.double_meat_price_delta_cents
FROM public.variant_modifier_group vmg
JOIN public.item_variant iv ON iv.id = vmg.variant_id
JOIN public.menu_item mi    ON mi.id = iv.item_id
WHERE mi.category='original-tacos'
ORDER BY vmg.variant_id, vmg.group_id;

\echo '== I. current_user sanity (should be the operator role, e.g. postgres) =='
SELECT current_user;
