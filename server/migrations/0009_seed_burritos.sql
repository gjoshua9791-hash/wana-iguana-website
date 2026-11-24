-- Migration: 0009_seed_burritos
-- Feature 3 — Database-back the Burritos category (seed half)
-- Seeds the seven confirmed burritos, their default variants, the three confirmed
-- protein shapes, the fixed-seafood extra-portion options, and the reusable
-- optional wet upgrade. Confirmed values only (requirements §Confirmed rules); no
-- taco rule is carried over; no business rule is inferred from display-name text.
--
-- Transaction *body* (no BEGIN/COMMIT); operator wraps it atomically with the
-- ledger INSERT. ON CONFLICT DO NOTHING makes a retried apply safe. Schema-
-- qualified. Depends on 0008 (double_portion_price_delta_cents column).
--
-- MODELING (per design §2b):
--   * Group A (Fajita/Super/Grande/Bravo): shared required choose-one group
--     'burrito-protein' (min 1 / max 1). Five options, all price_delta 0. The four
--     meats can be doubled for +299 (double_portion_price_delta_cents = 299);
--     grilled veggies cannot (NULL).
--   * Fixed seafood (Del Mar = shrimp, Grilled Fish = fish): the included seafood is
--     in the base price and is NOT a choice -> no required protein group. Each links
--     an OPTIONAL extra-portion group (min 0 / max 1) with a single +349 option. That
--     option is itself the extra portion, so it is NOT itself doubleable
--     (double_portion_price_delta_cents = NULL): no doubling the extra again.
--   * Classic: optional, removable added protein group 'classic-protein'
--     (min 0 / max 1). Its options use DISTINCT ids from Group A because their base-
--     add price deltas differ (+250 veggies / +299 meats / +349 seafood). Doubling an
--     added meat = +299, an added seafood = +349, veggies = NULL (no double).
--   * Wet upgrade: reusable optional group 'wet-upgrade' (min 0 / max 1), one 'wet'
--     option at +429, linked to all seven. Independent of protein/double. The former
--     static "Wet Burrito Add On" is this modifier, NOT a menu_item.
--   * All variant_modifier_group links set double_meat_price_delta_cents = NULL:
--     burritos never use the taco group-level double-meat amount.
--   * Monster Diabla is intentionally NOT touched (future; comes wet by default).

-- ---------------------------------------------------------------------------
-- 1. Items (category = 'burritos'; sort_order = display order).
-- ---------------------------------------------------------------------------
INSERT INTO public.menu_item (id, name, description, is_active, category, sort_order) VALUES
  ('fajita-burrito',       'Fajita Burrito',       'Grilled fajita style steak or chicken with grilled peppers, onions, and zucchini cooked in our special tomato sauce.', TRUE, 'burritos', 1),
  ('super-burrito',        'Super Burrito',        'Shredded beef, beans, cheese, pico de gallo, guacamole, and sour cream.',                                               TRUE, 'burritos', 2),
  ('burrito-grande',       'Burrito Grande',       'Steak or chicken with rice, beans, cheese, and pico de gallo.',                                                         TRUE, 'burritos', 3),
  ('bravo-burrito',        'Bravo Burrito',        'Steak or chicken with beans, avocado, cheese, and our spicy bravo salsa.',                                              TRUE, 'burritos', 4),
  ('burrito-del-mar',      'Burrito Del Mar',      'Grilled shrimp with rice, tomatoes, cheese, and slices of avocado.',                                                    TRUE, 'burritos', 5),
  ('grilled-fish-burrito', 'Grilled Fish Burrito', 'Grilled fish (tilapia) with rice, cabbage, and our special white sauce.',                                               TRUE, 'burritos', 6),
  ('classic-burrito',      'Classic Burrito',      'Rice, beans, and cheese.',                                                                                              TRUE, 'burritos', 7)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Default variants (confirmed base prices, integer cents).
-- ---------------------------------------------------------------------------
INSERT INTO public.item_variant (id, item_id, name, base_price_cents, is_default, is_active) VALUES
  ('fajita-burrito-base',       'fajita-burrito',       'Base', 1549, TRUE, TRUE),
  ('super-burrito-base',        'super-burrito',        'Base', 1349, TRUE, TRUE),
  ('burrito-grande-base',       'burrito-grande',       'Base', 1349, TRUE, TRUE),
  ('bravo-burrito-base',        'bravo-burrito',        'Base', 1349, TRUE, TRUE),
  ('burrito-del-mar-base',      'burrito-del-mar',      'Base', 1599, TRUE, TRUE),
  ('grilled-fish-burrito-base', 'grilled-fish-burrito', 'Base', 1599, TRUE, TRUE),
  ('classic-burrito-base',      'classic-burrito',      'Base',  929, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Modifier groups.
-- ---------------------------------------------------------------------------
INSERT INTO public.modifier_group (id, name, label) VALUES
  ('burrito-protein',  'Burrito protein',       'Choose one'),
  ('classic-protein',  'Classic added protein', 'Add a protein?'),
  ('delmar-extra',     'Extra shrimp',          'Add an extra portion?'),
  ('fish-extra',       'Extra fish',            'Add an extra portion?'),
  ('wet-upgrade',      'Wet upgrade',           'Make it wet?')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Options.
--    Columns: (id, group_id, name, price_delta_cents, sort_order,
--              double_meat_available, double_portion_price_delta_cents)
--    double_meat_available stays FALSE for all burrito options (taco-only field).
-- ---------------------------------------------------------------------------
-- Group A shared protein options: $0 base delta; meats double +299, veggies NULL.
INSERT INTO public.modifier_option
  (id, group_id, name, price_delta_cents, sort_order, double_meat_available, double_portion_price_delta_cents) VALUES
  ('burrito-steak',            'burrito-protein', 'Steak',            0, 1, FALSE, 299),
  ('burrito-chicken',          'burrito-protein', 'Chicken',          0, 2, FALSE, 299),
  ('burrito-shredded-beef',    'burrito-protein', 'Shredded Beef',    0, 3, FALSE, 299),
  ('burrito-shredded-chicken', 'burrito-protein', 'Shredded Chicken', 0, 4, FALSE, 299),
  ('burrito-grilled-veggies',  'burrito-protein', 'Grilled Veggies',  0, 5, FALSE, NULL)
ON CONFLICT (id) DO NOTHING;

-- Classic added-protein options: DISTINCT ids (base-add deltas differ from Group A).
INSERT INTO public.modifier_option
  (id, group_id, name, price_delta_cents, sort_order, double_meat_available, double_portion_price_delta_cents) VALUES
  ('classic-grilled-veggies',  'classic-protein', 'Grilled Veggies',  250, 1, FALSE, NULL),
  ('classic-steak',            'classic-protein', 'Steak',            299, 2, FALSE, 299),
  ('classic-chicken',          'classic-protein', 'Chicken',          299, 3, FALSE, 299),
  ('classic-shredded-beef',    'classic-protein', 'Shredded Beef',    299, 4, FALSE, 299),
  ('classic-shredded-chicken', 'classic-protein', 'Shredded Chicken', 299, 5, FALSE, 299),
  ('classic-grilled-fish',     'classic-protein', 'Grilled Fish',     349, 6, FALSE, 349),
  ('classic-grilled-shrimp',   'classic-protein', 'Grilled Shrimp',   349, 7, FALSE, 349)
ON CONFLICT (id) DO NOTHING;

-- Fixed-seafood extra-portion options: a single +349 optional add; not itself
-- doubleable (NULL) — no doubling the extra portion again.
INSERT INTO public.modifier_option
  (id, group_id, name, price_delta_cents, sort_order, double_meat_available, double_portion_price_delta_cents) VALUES
  ('extra-shrimp', 'delmar-extra', 'Extra shrimp', 349, 1, FALSE, NULL),
  ('extra-fish',   'fish-extra',   'Extra fish',   349, 1, FALSE, NULL)
ON CONFLICT (id) DO NOTHING;

-- Wet upgrade: single +429 option; not doubleable.
INSERT INTO public.modifier_option
  (id, group_id, name, price_delta_cents, sort_order, double_meat_available, double_portion_price_delta_cents) VALUES
  ('wet', 'wet-upgrade', 'Wet (red sauce + melted cheese)', 429, 1, FALSE, NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Variant <-> group links (selection limits; sort_order orders groups in the
--    item; double_meat_price_delta_cents = NULL everywhere for burritos).
-- ---------------------------------------------------------------------------
-- Group A: required protein (1/1) at sort 1, wet (0/1) at sort 2.
INSERT INTO public.variant_modifier_group
  (variant_id, group_id, min_select, max_select, sort_order, double_meat_price_delta_cents) VALUES
  ('fajita-burrito-base', 'burrito-protein', 1, 1, 1, NULL),
  ('fajita-burrito-base', 'wet-upgrade',     0, 1, 2, NULL),
  ('super-burrito-base',  'burrito-protein', 1, 1, 1, NULL),
  ('super-burrito-base',  'wet-upgrade',     0, 1, 2, NULL),
  ('burrito-grande-base', 'burrito-protein', 1, 1, 1, NULL),
  ('burrito-grande-base', 'wet-upgrade',     0, 1, 2, NULL),
  ('bravo-burrito-base',  'burrito-protein', 1, 1, 1, NULL),
  ('bravo-burrito-base',  'wet-upgrade',     0, 1, 2, NULL)
ON CONFLICT (variant_id, group_id) DO NOTHING;

-- Fixed-seafood: optional extra-portion (0/1) at sort 1, wet (0/1) at sort 2.
INSERT INTO public.variant_modifier_group
  (variant_id, group_id, min_select, max_select, sort_order, double_meat_price_delta_cents) VALUES
  ('burrito-del-mar-base',      'delmar-extra', 0, 1, 1, NULL),
  ('burrito-del-mar-base',      'wet-upgrade',  0, 1, 2, NULL),
  ('grilled-fish-burrito-base', 'fish-extra',   0, 1, 1, NULL),
  ('grilled-fish-burrito-base', 'wet-upgrade',  0, 1, 2, NULL)
ON CONFLICT (variant_id, group_id) DO NOTHING;

-- Classic: optional added protein (0/1) at sort 1, wet (0/1) at sort 2.
INSERT INTO public.variant_modifier_group
  (variant_id, group_id, min_select, max_select, sort_order, double_meat_price_delta_cents) VALUES
  ('classic-burrito-base', 'classic-protein', 0, 1, 1, NULL),
  ('classic-burrito-base', 'wet-upgrade',     0, 1, 2, NULL)
ON CONFLICT (variant_id, group_id) DO NOTHING;
