-- Migration: 0007_seed_original_tacos
-- Feature 2 — Database-back the whole Original Tacos category
-- Seeds the four remaining Original Tacos items, their default variants (all five
-- base prices restaurant-CONFIRMED), the confirmed protein groups/options with
-- double-meat metadata, the variant<->group links (exactly-one + per-item
-- double-meat surcharge), and the INTENTIONAL Taco Suave catalog-data change
-- (expand to five proteins + add the 150 double-meat surcharge).
--
-- NEVER edits 0001-0004. The Suave expansion is applied here by explicit UPDATEs,
-- not by rewriting the already-applied 0004 seed. Transaction *body* (no
-- BEGIN/COMMIT); the operator wraps it atomically with the ledger INSERT.
--
-- ON CONFLICT DO NOTHING on inserts makes a partial/retried apply safe; the two
-- UPDATEs are explicit, deliberate reconciliations of already-present 0004 rows.
--
-- CONFIRMED VALUES (not inferred):
--   base prices (cents): suave 525 (0004), duro 525, bravo 525, supreme 850,
--     del-mar 675.
--   protein: required exactly-one (min_select=1, max_select=1).
--   base-protein price_delta_cents = 0 for every option.
--   double meat: suave +150, bravo +150, supreme +299; duro/del-mar none.
--     double_meat_available: meats TRUE, grilled veggies FALSE, seafood FALSE.
--     (These availability values are THIS milestone's confirmed Original Tacos
--      rules, not a permanent property of those foods.)
-- SCHEMA QUALIFICATION: every table is public.-qualified.

-- ---------------------------------------------------------------------------
-- 1. Items (four new; Taco Suave already exists from 0004).
-- ---------------------------------------------------------------------------
INSERT INTO public.menu_item (id, name, description, is_active, category, sort_order) VALUES
  ('taco-duro',    'Taco Duro',
   'Crispy shell corn tortilla with choice of shredded beef or shredded chicken with cheese, lettuce, and our special tomato sauce. (Meat substitutions not allowed)',
   TRUE, 'original-tacos', 2),
  ('taco-bravo',   'Taco Bravo',
   'Choice of steak or chicken, beans, avocado, and our spicy bravo salsa.',
   TRUE, 'original-tacos', 3),
  ('taco-del-mar', 'Taco Del Mar',
   'Choice of grilled fish (tilapia) or grilled shrimp with cabbage, pico de gallo, and our special white sauce.',
   TRUE, 'original-tacos', 4),
  ('taco-supreme', 'Taco Supreme',
   'Large crispy flour tortilla with choice of shredded beef or grilled chicken with lettuce, cheese, sour cream, and guacamole.',
   TRUE, 'original-tacos', 5)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Default variants (all base prices confirmed). Taco Suave's variant exists
--    from 0004.
-- ---------------------------------------------------------------------------
INSERT INTO public.item_variant (id, item_id, name, base_price_cents, is_default, is_active) VALUES
  ('taco-duro-base',    'taco-duro',    'Base', 525, TRUE, TRUE),
  ('taco-bravo-base',   'taco-bravo',   'Base', 525, TRUE, TRUE),
  ('taco-supreme-base', 'taco-supreme', 'Base', 850, TRUE, TRUE),
  ('taco-del-mar-base', 'taco-del-mar', 'Base', 675, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Modifier groups. The shared 'protein' group exists from 0004; add the two
--    dedicated groups (distinct option sets).
-- ---------------------------------------------------------------------------
INSERT INTO public.modifier_group (id, name, label) VALUES
  ('protein-duro',    'Protein (Duro)',    'Choose one'),
  ('protein-seafood', 'Protein (Seafood)', 'Choose one')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Protein options (globally unique ids). Shared 'protein' group adds the
--    three new options (steak/chicken exist from 0004). Duro options use a
--    'duro-' prefix so they never collide with the shared 'shredded-*' ids.
-- ---------------------------------------------------------------------------
INSERT INTO public.modifier_option (id, group_id, name, price_delta_cents, sort_order, double_meat_available) VALUES
  -- shared 'protein' group additions (Suave/Bravo/Supreme):
  ('shredded-beef',         'protein',         'Shredded Beef',    0, 3, TRUE),
  ('shredded-chicken',      'protein',         'Shredded Chicken', 0, 4, TRUE),
  ('grilled-veggies',       'protein',         'Grilled Veggies',  0, 5, FALSE),
  -- Duro-only group (two options, globally unique ids):
  ('duro-shredded-chicken', 'protein-duro',    'Shredded Chicken', 0, 1, FALSE),
  ('duro-shredded-beef',    'protein-duro',    'Shredded Beef',    0, 2, FALSE),
  -- Del Mar seafood group:
  ('grilled-fish',          'protein-seafood', 'Grilled Fish',     0, 1, FALSE),
  ('grilled-shrimp',        'protein-seafood', 'Grilled Shrimp',   0, 2, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Variant <-> group links: required exactly-one, plus per-item double-meat
--    surcharge (NULL = not offered). Suave's link to 'protein' exists from 0004
--    and is reconciled in step 6.
-- ---------------------------------------------------------------------------
INSERT INTO public.variant_modifier_group
  (variant_id, group_id, min_select, max_select, sort_order, double_meat_price_delta_cents) VALUES
  ('taco-bravo-base',   'protein',         1, 1, 1, 150),   -- Bravo:   +150
  ('taco-supreme-base', 'protein',         1, 1, 1, 299),   -- Supreme: +299
  ('taco-duro-base',    'protein-duro',    1, 1, 1, NULL),  -- Duro:    none
  ('taco-del-mar-base', 'protein-seafood', 1, 1, 1, NULL)   -- Del Mar: none
ON CONFLICT (variant_id, group_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. INTENTIONAL Taco Suave catalog-data change (NOT a rewrite of 0004).
--    0004 seeded Suave with steak+chicken only and no double meat. The confirmed
--    rules expand Suave to the five shared-group options (achieved by the step-4
--    inserts into 'protein', which Suave's link already references) and add a
--    +150 double-meat surcharge. Mark the shared-group meats doubleable; grilled
--    veggies stays FALSE.
-- ---------------------------------------------------------------------------
UPDATE public.modifier_option SET double_meat_available = TRUE
  WHERE id IN ('steak', 'chicken', 'shredded-beef', 'shredded-chicken');

UPDATE public.variant_modifier_group SET double_meat_price_delta_cents = 150
  WHERE variant_id = 'taco-suave-base' AND group_id = 'protein';
