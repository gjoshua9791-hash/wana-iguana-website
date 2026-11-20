-- Migration: 0004_seed_taco_suave
-- Feature 1 — Display Taco Suave from a Database-Backed API
-- Seeds the verified Taco Suave catalog rows exactly as in design.md §2
-- ("Example rows — Taco Suave with Steak & Chicken") and §3 (the full
-- description string from the example response).
--
-- TRANSACTIONS: like 0001/0002, this file contains NO `BEGIN`/`COMMIT`. It is a
-- transaction *body* that the migration operator wraps together with its
-- schema_migrations ledger INSERT so the seed and its ledger record commit
-- atomically (see migrations/README.md). Do not add a COMMIT here.
--
-- ONE-TIME migration, written to be SAFE to re-run via `ON CONFLICT DO NOTHING`
-- on each primary key, so a partial/retried apply does not error on already-
-- present rows. The ledger still tracks it as applied once.
--
-- IMPORTANT — `ON CONFLICT DO NOTHING` only prevents DUPLICATE inserts; it does
-- NOT reconcile existing rows with changed seed values. If a row with the same
-- primary key already exists, its columns are left UNCHANGED (no UPDATE). To
-- change already-seeded values, use a separate, explicit migration (e.g. an
-- UPDATE or ON CONFLICT ... DO UPDATE) rather than editing and re-running this
-- file.
--
-- SCHEMA QUALIFICATION: every table is `public.`-qualified.
--
-- VALUES ARE VERIFIED DATA, NOT INFERRED:
--   * base_price_cents = 525  -> $5.25, restaurant-verified (requirements/design).
--   * Steak and Chicken carry price_delta_cents = 0 (NO surcharge). The menu
--     description mentions no upcharge and none is inferred from it.
--   * The exactly-one protein rule is DATA on the variant<->group link:
--     min_select = 1, max_select = 1. This is the catalog business rule and is
--     independent of the frontend's initially-empty (null) UI selection.
--
-- IDs vs display names: the text slugs (taco-suave, taco-suave-base, protein,
-- steak, chicken) are the immutable primary keys and are kept separate from the
-- editable display names/labels (Taco Suave, Base, Protein, Choose one, Steak,
-- Chicken).

-- menu_item: Taco Suave, active.
INSERT INTO public.menu_item (id, name, description, is_active) VALUES
  ('taco-suave', 'Taco Suave',
   'Soft corn tortilla taco with lettuce, cheese, and pico de gallo.', TRUE)
ON CONFLICT (id) DO NOTHING;

-- item_variant: the active DEFAULT variant carrying the verified base price.
INSERT INTO public.item_variant
  (id, item_id, name, base_price_cents, is_default, is_active) VALUES
  ('taco-suave-base', 'taco-suave', 'Base', 525, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- modifier_group: Protein, displayed as "Choose one".
INSERT INTO public.modifier_group (id, name, label) VALUES
  ('protein', 'Protein', 'Choose one')
ON CONFLICT (id) DO NOTHING;

-- modifier_option: Steak and Chicken, both with zero price delta.
INSERT INTO public.modifier_option
  (id, group_id, name, price_delta_cents, sort_order) VALUES
  ('steak',   'protein', 'Steak',   0, 1),
  ('chicken', 'protein', 'Chicken', 0, 2)
ON CONFLICT (id) DO NOTHING;

-- variant_modifier_group: link the default variant to Protein with the
-- exactly-one rule (min_select = 1, max_select = 1).
INSERT INTO public.variant_modifier_group
  (variant_id, group_id, min_select, max_select, sort_order) VALUES
  ('taco-suave-base', 'protein', 1, 1, 1)
ON CONFLICT (variant_id, group_id) DO NOTHING;
