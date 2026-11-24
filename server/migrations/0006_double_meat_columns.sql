-- Migration: 0006_double_meat_columns
-- Feature 2 — Database-back the whole Original Tacos category
-- ADDITIVE schema change for the double-meat <-> protein dependency (design §1a).
-- Adds columns only; seeds no data. Does NOT alter 0001-0004, creates/drops no
-- table, and is a transaction *body* (no BEGIN/COMMIT) wrapped atomically with
-- the ledger INSERT by the operator.
--
-- WHY THESE TWO COLUMNS (not a separate "double meat" modifier group):
--   Double meat is an extra portion of the SAME selected protein, is unavailable
--   for grilled veggies, and carries a per-item surcharge. Two independent
--   modifier groups cannot express that dependency without a generic rules
--   engine (which we are NOT building). The smallest explicit model attaches the
--   dependency to the protein option and the variant<->group link:
--     * modifier_option.double_meat_available  -> intrinsic to the option
--       (meats TRUE, grilled veggies / seafood FALSE). "Not doubleable" is thus
--       true everywhere that option is used, with no cross-group rule. This flag
--       reflects THIS milestone's confirmed Original Tacos rules, not a permanent
--       property of any food; future items/options may set it differently.
--     * variant_modifier_group.double_meat_price_delta_cents -> per-item surcharge
--       on the protein link (NULL = double meat not offered for that item).
--
-- RUNTIME ACCESS: menu_backend already has table-level SELECT on both tables
-- (0003); new columns are covered by the existing grant. No new GRANT, no write
-- path. SCHEMA QUALIFICATION: public.-qualified.

-- Per-option availability. DEFAULT FALSE backfills every existing row (incl. the
-- 0004 steak/chicken); 0007 flips the shared-group meats to TRUE explicitly.
ALTER TABLE public.modifier_option
  ADD COLUMN double_meat_available BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-item double-meat surcharge on the variant<->group link. Nullable: NULL =
-- not offered for that item. Non-negative integer cents when present.
ALTER TABLE public.variant_modifier_group
  ADD COLUMN double_meat_price_delta_cents INTEGER
  CHECK (double_meat_price_delta_cents IS NULL OR double_meat_price_delta_cents >= 0);
