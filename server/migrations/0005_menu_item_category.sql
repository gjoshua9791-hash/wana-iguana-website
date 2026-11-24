-- Migration: 0005_menu_item_category
-- Feature 2 — Database-back the whole Original Tacos category
-- ADDITIVE schema change: adds two columns to the existing public.menu_item and
-- backfills the one already-seeded row (Taco Suave). It does NOT create or drop
-- any table, does NOT alter migrations 0001-0004, and is a transaction *body*
-- (no BEGIN/COMMIT) that the operator wraps atomically with its
-- schema_migrations ledger INSERT, exactly like 0001-0004 (see migrations/README.md).
--
-- RUNTIME ACCESS: menu_backend already holds table-level SELECT on
-- public.menu_item (0003). Columns added to that table are covered by the
-- existing grant, so NO new GRANT is required. No write path is added.
--
-- SCHEMA QUALIFICATION: all objects are public.-qualified.

-- Stable category slug (immutable-style identifier), separate from any display
-- label; nullable so existing/other rows are simply uncategorised.
ALTER TABLE public.menu_item ADD COLUMN category TEXT;

-- Deterministic ordering key within a category; NOT NULL with a default so every
-- existing row stays valid without a rewrite. List queries order by
-- (sort_order, id) so ties and default-0 rows have a stable, repeatable order.
ALTER TABLE public.menu_item ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill the already-seeded Taco Suave into the category at position 1.
UPDATE public.menu_item
   SET category = 'original-tacos', sort_order = 1
 WHERE id = 'taco-suave';            -- expect 1 row
