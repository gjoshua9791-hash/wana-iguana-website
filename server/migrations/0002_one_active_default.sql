-- Migration: 0002_one_active_default
-- Feature 1 — Display Taco Suave from a Database-Backed API
-- Adds the partial unique index from design.md §1 that enforces, per menu item,
-- AT MOST ONE variant that is simultaneously is_default = true AND is_active = true.
--
-- TRANSACTIONS: like 0001, this file contains NO `BEGIN`/`COMMIT`. It is a
-- transaction *body* that the migration operator wraps together with its
-- schema_migrations ledger INSERT so the index and its ledger record commit
-- atomically (see migrations/README.md). Do not add a COMMIT here.
--
-- ONE-TIME, NON-IDEMPOTENT: bare CREATE UNIQUE INDEX (no IF NOT EXISTS),
-- intended to be applied exactly once and tracked by the ledger. Re-running
-- against a database that already has this index will error — intentional.
--
-- SCHEMA QUALIFICATION: the index target table is explicitly `public.item_variant`.
--
-- WHAT THIS ENFORCES (the "at-most-one" half):
--   A second row with (item_id = X, is_default = true, is_active = true) is
--   REJECTED by the database. Deterministic single-variant display therefore
--   cannot be broken by two competing active defaults.
--
-- WHAT THIS DOES *NOT* GUARANTEE (the "at-least-one" half):
--   It does NOT force an active default to exist. ZERO active defaults for an
--   item is still perfectly legal at the database level (a partial unique index
--   constrains the rows that DO match the predicate; it never requires a match).
--   An item may have no variants, or only inactive/non-default ones.
--
--   Consequently, "an active item has exactly one active default" is a
--   CATALOG-READINESS expectation satisfied by seed data and verification — NOT
--   a database constraint. At read time the API treats "active item, no active
--   default" as 404 item_not_found (design §3/§4); it never fabricates or merges
--   another variant to cover the gap.
--
-- Depends on: 0001_create_catalog.sql (public.item_variant must already exist).

CREATE UNIQUE INDEX one_active_default_per_item
  ON public.item_variant (item_id)
  WHERE is_default AND is_active;
