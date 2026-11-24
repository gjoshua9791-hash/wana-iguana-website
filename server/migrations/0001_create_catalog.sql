-- Migration: 0001_create_catalog
-- Feature 1 — Display Taco Suave from a Database-Backed API
-- Creates the five-table catalog schema exactly as specified in
-- .kiro/specs/taco-suave-menu-api/design.md §1.
--
-- Scope of THIS migration: table structure only — primary keys, foreign keys
-- (with the design's CASCADE/RESTRICT delete rules), NOT NULL, CHECK, defaults,
-- and the composite PK on the join table — plus enabling row-level security
-- (RLS) on every catalog table. The partial unique index for "at most one
-- active default variant per item" is a SEPARATE migration
-- (0002_one_active_default.sql). No seed data is inserted here.
--
-- TRANSACTIONS: this file deliberately contains NO `BEGIN`/`COMMIT`. It is a
-- transaction *body* that the migration operator wraps in a single transaction
-- together with the schema_migrations ledger INSERT, so the schema change and
-- its ledger record commit atomically (see migrations/README.md). Do not add a
-- COMMIT here — a premature COMMIT would end the operator's transaction and
-- break that atomicity.
--
-- ONE-TIME, NON-IDEMPOTENT: these statements use bare CREATE TABLE (not
-- CREATE TABLE IF NOT EXISTS) and are intended to be applied exactly once,
-- tracked by the ledger. Re-running against a database that already has these
-- objects will error — that is intentional (the ledger prevents re-runs).
--
-- SCHEMA QUALIFICATION: all tables, foreign-key references, and (in 0002) the
-- index target are explicitly qualified with `public.` so the objects land in a
-- known schema regardless of the session search_path.
--
-- Prices are stored as INTEGER CENTS (e.g. 525 = $5.25) to avoid floating-point
-- rounding (design/requirements AC14). There are NO price columns of any other
-- kind; option price changes use price_delta_cents (0 = no change), never a
-- separate price_cents column.
--
-- APPLICATION CONVENTIONS (NOT database-enforced):
--   * "Immutable IDs": the text slug primary keys are treated as immutable by
--     the application — the DB does not forbid an UPDATE to a primary key beyond
--     normal FK integrity. Immutability is an application/operator discipline.
--   * "Archival over deletion": is_active = false is the app-level convention
--     for retiring menu_item/item_variant rows. The DB does not prevent a hard
--     DELETE (subject to the FK RESTRICT rules); archival is a convention, not a
--     constraint.

-- ---------------------------------------------------------------------------
-- menu_item — one row per dish (e.g. "Taco Suave").
--   id         : immutable text slug, primary key (app convention: never
--                changed once assigned).
--   name       : editable display name, kept separate from the immutable id.
--   description: optional free text (NULL allowed).
--   is_active  : archival flag; app-level "removal" is archival
--                (is_active = false), not a hard DELETE, so history/references
--                survive. (Convention, not DB-enforced.)
-- ---------------------------------------------------------------------------
CREATE TABLE public.menu_item (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- item_variant — a sellable version of an item; it carries the price.
--   item_id          : FK -> public.menu_item(id). ON DELETE RESTRICT — do not
--                      let deleting an item quietly destroy its priced variants;
--                      archive the item instead.
--   base_price_cents : INTEGER cents, non-negative.
--   is_default       : exactly one active default per item is the catalog-
--                      readiness expectation; the DB enforces only AT MOST ONE
--                      (via the partial unique index in 0002).
--   is_active        : archival flag (see menu_item).
-- ---------------------------------------------------------------------------
CREATE TABLE public.item_variant (
  id               TEXT    PRIMARY KEY,
  item_id          TEXT    NOT NULL REFERENCES public.menu_item (id) ON DELETE RESTRICT,
  name             TEXT    NOT NULL,
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- modifier_group — a reusable, labeled set of choices (e.g. "Protein").
--   The group itself does NOT carry selection counts; min/max live on the
--   variant<->group link (variant_modifier_group) because the rule describes
--   how a particular variant uses the group.
--   name  : internal name (e.g. "Protein").
--   label : customer-facing display label (e.g. "Choose one").
--   NOTE: this table intentionally has NO is_active column in this feature;
--   group/option archival is out of scope here.
-- ---------------------------------------------------------------------------
CREATE TABLE public.modifier_group (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  label TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- modifier_option — one choice inside a group (e.g. "Steak", "Chicken").
--   group_id          : FK -> public.modifier_group(id). ON DELETE CASCADE — an
--                       option cannot exist without its group (truly owned row).
--   price_delta_cents : INTEGER cents relative to base; non-negative; 0 = no
--                       change. (No absolute price column here.)
--   sort_order        : display ordering within the group.
-- ---------------------------------------------------------------------------
CREATE TABLE public.modifier_option (
  id                TEXT    PRIMARY KEY,
  group_id          TEXT    NOT NULL REFERENCES public.modifier_group (id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_delta_cents >= 0),
  sort_order        INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- variant_modifier_group — join table linking a variant to a modifier group.
--   It carries the SELECTION RULES (min_select, max_select) because the rules
--   describe how THIS variant uses the group; the same group could be reused by
--   another variant with different rules.
--   variant_id : FK -> public.item_variant(id). ON DELETE CASCADE — the link is
--                meaningless without its variant (owned row).
--   group_id   : FK -> public.modifier_group(id). ON DELETE RESTRICT — do not
--                let deleting a shared group silently sever links; remove links
--                explicitly (or archive) first.
--   min_select : >= 0 (0 allowed = optional group in general).
--   max_select : >= 1 AND >= min_select (a usable group permits at least one
--                pick and never fewer than the minimum).
--   PRIMARY KEY (variant_id, group_id) — composite PK prevents duplicate links.
--
--   For Taco Suave's default variant <-> Protein link the SEED (0004) sets
--   min_select = 1, max_select = 1 ("exactly one, required"). That business
--   rule is DATA in the seed, not a column default here. The schema's defaults
--   (min 0 / max 1) describe the general case; they are deliberately NOT changed
--   to express the protein rule, and they are unrelated to the frontend's
--   initially-empty selection (temporary UI state).
-- ---------------------------------------------------------------------------
CREATE TABLE public.variant_modifier_group (
  variant_id TEXT    NOT NULL REFERENCES public.item_variant (id)   ON DELETE CASCADE,
  group_id   TEXT    NOT NULL REFERENCES public.modifier_group (id) ON DELETE RESTRICT,
  min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1 AND max_select >= min_select),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (variant_id, group_id)
);

-- ---------------------------------------------------------------------------
-- Row-Level Security (RLS): enable on ALL FIVE catalog tables, before COMMIT.
--
--   WHY, even though the tables are empty: enabling RLS now closes the window in
--   which a freshly created table could accept UNAUTHORIZED INSERTs. An empty
--   table is not a safe table — if it is reachable by a role that holds INSERT
--   (e.g. an anon/public write grant), that role can write rows into it
--   immediately. With RLS enabled and NO policies defined, non-owner roles are
--   denied all row access by default (the table owner and BYPASSRLS roles are
--   exceptions), so the catalog cannot be written through such a role until the
--   access-control migration deliberately decides what is allowed.
--
--   SCOPE: this migration ONLY enables RLS. It intentionally adds NO policies
--   and performs NO GRANT/REVOKE. The later access-control migration
--   (0003_access_policies.sql, Task C2) owns the final grants/revokes and the
--   backend's server-side-only access. Enabling RLS here is the "default-deny"
--   floor; 0003 defines the precise server-side read path.
-- ---------------------------------------------------------------------------
ALTER TABLE public.menu_item              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_variant           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_group         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_option        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_modifier_group ENABLE ROW LEVEL SECURITY;
