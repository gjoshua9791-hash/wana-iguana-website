-- Migration: 0008_double_portion_column
-- Feature 3 — Database-back the Burritos category (schema half)
-- ADDITIVE schema change: one nullable column on modifier_option that prices a
-- second ("double") portion of THAT specific option. Adds a column only; seeds no
-- data. Does NOT alter 0001-0007, creates/drops no table, and is a transaction
-- *body* (no BEGIN/COMMIT) the operator wraps atomically with the ledger INSERT.
--
-- WHY A PER-OPTION COLUMN (design §1a):
--   Original Tacos prices double meat at the GROUP level
--   (variant_modifier_group.double_meat_price_delta_cents) with a per-option
--   boolean (modifier_option.double_meat_available). That cannot express the
--   confirmed Classic Burrito rule, where doubling costs +299 for meats but +349
--   for seafood and is impossible for veggies/none — three behaviors WITHIN ONE
--   group. The smallest additive fix is a nullable per-option price:
--     * NULL                -> this option cannot be doubled (e.g. grilled veggies).
--     * >= 0 integer cents  -> the surcharge to add a second portion of THIS option.
--   This is independent of the taco group-level fields, which are left untouched
--   (Original Tacos keeps using them; burritos use this column).
--
-- RUNTIME ACCESS: menu_backend already has table-level SELECT on modifier_option
-- (0003); a new column on that table is covered by the existing grant. No new
-- GRANT, no write path. SCHEMA QUALIFICATION: public.-qualified.

ALTER TABLE public.modifier_option
  ADD COLUMN double_portion_price_delta_cents INTEGER
  CHECK (double_portion_price_delta_cents IS NULL OR double_portion_price_delta_cents >= 0);
