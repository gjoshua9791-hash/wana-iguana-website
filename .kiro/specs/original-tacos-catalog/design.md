# Design — Feature 2: Database-back the whole Original Tacos category

## Status
**Draft for team review.** Extends Feature 1
(`.kiro/specs/taco-suave-menu-api/design.md`). Reuses that feature's five-table
schema, read-only Express API, verified-TLS pool, and in-place React display. The
protein options, required exactly-one rule, $0 base-protein deltas, the double-meat
surcharges + same-meat/veggies-exclusion dependency, and Del Mar's 675 base price are
now **restaurant-confirmed** (see `requirements.md`). Other base prices (Duro, Bravo,
Supreme) remain **pending** and are not encoded until confirmed. Nothing is inferred.

## Goal
Serve all five **Original Tacos** items from PostgreSQL and render them in place with
a **reusable** menu-item component, while leaving Feature 1's single-item endpoint and
Taco Suave behavior exactly as they are.

---

## 1. Schema — reuse, with one small additive change under review

The existing five tables (`menu_item`, `item_variant`, `modifier_group`,
`modifier_option`, `variant_modifier_group`; see Feature 1 design §1 and
`0001_create_catalog.sql`) already model multiple items, each with a default variant
and optional modifier groups. **No table needs restructuring.**

The one gap for a *category* endpoint is that `menu_item` has no category column —
today "Original Tacos" membership lives only in the frontend's `menu.js`. Two options:

- **Option A (proposed): add a nullable `category` column to `menu_item`** via a new
  additive migration. Clean, queryable grouping (`WHERE category = 'original-tacos'`),
  display order via a new `sort_order` column.
- **Option B: no schema change** — the endpoint hard-codes the five Original Tacos ids
  in a fixed order. Avoids a migration but bakes membership into code, which is the
  opposite of this milestone's "database-backed" goal.

**Design recommends Option A.** `0005_menu_item_category.sql` is a purely **additive
schema change** — it only `ADD COLUMN`s (plus a one-row backfill of the existing
Taco Suave); it creates no table, drops nothing, and does not modify or re-run
`0001`–`0004`.

```sql
-- 0005_menu_item_category.sql
-- ADDITIVE schema change: adds two nullable/defaulted columns to an existing
-- table and backfills the one already-seeded row. It does NOT create or drop
-- tables, does NOT alter 0001–0004, and is a transaction *body* (no BEGIN/COMMIT)
-- that the operator wraps atomically with its schema_migrations ledger INSERT,
-- exactly like 0001–0004 (see migrations/README.md).

-- Stable category slug (immutable-style identifier), separate from any display
-- label; nullable so existing/other rows are simply uncategorised.
ALTER TABLE public.menu_item ADD COLUMN category   TEXT;
-- Deterministic ordering key within a category; defaulted so existing rows are valid.
ALTER TABLE public.menu_item ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill the already-seeded Taco Suave into the category at position 1.
UPDATE public.menu_item
   SET category = 'original-tacos', sort_order = 1
 WHERE id = 'taco-suave';            -- expect 1 row
```

- **Stable category slug:** `'original-tacos'` — a fixed, immutable-style identifier
  (not a display label). It matches the API path segment and the frontend category
  key, so membership is one stable value everywhere.
- **Deterministic ordering:** list queries order by `sort_order` **then `id`** as a
  stable tie-breaker, so two items sharing a `sort_order` (or a future row left at the
  default `0`) always come back in a single, repeatable order rather than
  PostgreSQL's arbitrary row order.
- **Runtime access:** `menu_backend` already holds table-level `SELECT` on
  `public.menu_item` (`0003`), which **covers columns added later to that table** —
  so Option A needs **no new GRANT**. (A *new table* or *view* would need its own
  SELECT grant + RLS read policy; Option A introduces neither.) Confirm in review.
- **Runner caveat (see §4 and the backend tasks):** the migration runner uses a
  **fixed, hard-coded ordered list** of migration filenames and validates the ledger
  as a literal prefix of it. New files are **not** picked up until that list is
  extended — this is a required runner update, tracked as a backend task, not an
  optional nicety.

---

## 1a. Representing the double-meat ↔ protein dependency (the only hard modeling problem)

The confirmed rules add a dependency the current five-table schema and JSON contract
**cannot** express as-is: double meat (a) is an extra portion of the **same selected
protein**, (b) is **disabled when "grilled veggies" is selected**, and (c) carries a
**per-item** surcharge (Suave/Bravo +150, Supreme +299; Duro/Del Mar none).

### Why independent modifier groups do NOT work
Modeling "Double meat" as a **separate** `modifier_group` (e.g. a yes/no) makes it
independent of the protein group. Nothing in the schema would then tie it to the
*selected* protein or forbid it for veggies — the client could present "double meat"
alongside a veggies selection, or alongside no protein, and the data would not say
otherwise. Enforcing the link would require cross-group conditional logic, i.e. a
**generic rules engine** — which we are explicitly not building. So independent groups
are rejected.

### Smallest explicit solution: double meat is an attribute of the protein option, priced on the variant link
Model double meat as data **attached to the protein choice**, not as its own group:

1. **Per-option availability (intrinsic to the protein option).** Add a boolean to
   `modifier_option` saying whether *this protein* can be doubled. Meats → true;
   **grilled veggies → false**. Because it lives on the option, "veggies cannot be
   doubled" is true everywhere that option is used, with no cross-group rule.
2. **Per-item surcharge (on the variant↔protein-group link).** The surcharge differs
   per item and the shared option rows are reused across items, so the **price** lives
   on `variant_modifier_group` (which already carries per-variant rules), as a
   nullable `double_meat_price_delta_cents`. Suave/Bravo link = 150, Supreme = 299;
   Duro/Del Mar = NULL (double meat not offered for that item).

This is explicit (the dependency is encoded as data on the protein option + the item's
protein link), minimal (two nullable columns, no new table, no rules engine), and it
makes "same meat, disabled for veggies, per-item price, not offered for Duro/Del Mar"
all representable. The "same meat" semantics fall out for free: double meat is a
property of the chosen protein option, so there is never a second protein.

### Proposed additive columns (new migration `0006`, before seeds in `0007`)
```sql
-- Availability is intrinsic to the protein option (veggies = false).
ALTER TABLE public.modifier_option
  ADD COLUMN double_meat_available BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-item double-meat surcharge lives on the variant<->group link (nullable:
-- NULL/absent = double meat not offered for that item). Non-negative when present.
ALTER TABLE public.variant_modifier_group
  ADD COLUMN double_meat_price_delta_cents INTEGER
  CHECK (double_meat_price_delta_cents IS NULL OR double_meat_price_delta_cents >= 0);
```
Both are **additive** (`ADD COLUMN` with safe defaults/nullable), do not touch
`0001`–`0004`, and are covered by the runtime role's existing table-level `SELECT`
(no new grant). The `max_select=1` protein rule is unchanged — double meat is **not** a
second selected option in the protein group; it is a flag on the single chosen option.

### Contract extension (JSON) — see §3b for the exact shape
The item JSON gains, **only inside the protein group**:
- a group-level `doubleMeat` object when the item offers it:
  `{ "priceDeltaCents": 150 }` (absent/`null` when not offered), sourced from the link
  column; and
- a per-option `doubleMeatAvailable` boolean, sourced from the option column.

No new top-level fields and no new modifier group. Clients that ignore the new fields
still render a valid required-protein group (existing fields/behavior preserved).

---

## 2. Seed data — split into items/variants and the confirmed modifiers

Two additive migrations, `0004`-style (schema-qualified, `ON CONFLICT DO NOTHING`,
confirmed values only). `0006` is the double-meat columns (§1a); seeds live in `0007`.

### 2a. Items + default variants (`0007`, part 1)
```sql
INSERT INTO public.menu_item (id, name, description, is_active, category, sort_order) VALUES
  ('taco-duro',    'Taco Duro',    '<current site description>', TRUE, 'original-tacos', 2),
  ('taco-bravo',   'Taco Bravo',   '<current site description>', TRUE, 'original-tacos', 3),
  ('taco-del-mar', 'Taco Del Mar', '<current site description>', TRUE, 'original-tacos', 4),
  ('taco-supreme', 'Taco Supreme', '<current site description>', TRUE, 'original-tacos', 5)
ON CONFLICT (id) DO NOTHING;

-- All five base prices are CONFIRMED, so every default variant is seeded.
INSERT INTO public.item_variant (id, item_id, name, base_price_cents, is_default, is_active) VALUES
  ('taco-duro-base',    'taco-duro',    'Base', 525, TRUE, TRUE),   -- $5.25
  ('taco-bravo-base',   'taco-bravo',   'Base', 525, TRUE, TRUE),   -- $5.25
  ('taco-supreme-base', 'taco-supreme', 'Base', 850, TRUE, TRUE),   -- $8.50
  ('taco-del-mar-base', 'taco-del-mar', 'Base', 675, TRUE, TRUE)    -- $6.75
ON CONFLICT (id) DO NOTHING;
```

### 2b. Confirmed protein options (`modifier_option` rows)
Three protein groups by distinct option set:
- **`protein`** (shared by Suave/Bravo/Supreme) — five options.
- **`protein-duro`** (Duro only) — two options, with **globally unique** ids.
- **`protein-seafood`** (Del Mar only) — two options.

Option ids are globally unique primary keys. The Duro options use the `duro-` prefix
so they never collide with the shared `protein` group's `shredded-*` ids even though
the display names overlap.

```sql
INSERT INTO public.modifier_option (id, group_id, name, price_delta_cents, sort_order, double_meat_available) VALUES
  -- Shared 'protein' group (Suave/Bravo/Supreme). steak/chicken already exist (0004).
  ('steak',                'protein',         'Steak',            0, 1, TRUE),
  ('chicken',              'protein',         'Chicken',          0, 2, TRUE),
  ('shredded-beef',        'protein',         'Shredded Beef',    0, 3, TRUE),
  ('shredded-chicken',     'protein',         'Shredded Chicken', 0, 4, TRUE),
  ('grilled-veggies',      'protein',         'Grilled Veggies',  0, 5, FALSE), -- not doubleable (THIS milestone)
  -- Duro-only group with globally unique option ids.
  ('duro-shredded-chicken','protein-duro',    'Shredded Chicken', 0, 1, FALSE), -- Duro: no double meat
  ('duro-shredded-beef',   'protein-duro',    'Shredded Beef',    0, 2, FALSE),
  -- Del Mar seafood group.
  ('grilled-fish',         'protein-seafood', 'Grilled Fish',     0, 1, FALSE),
  ('grilled-shrimp',       'protein-seafood', 'Grilled Shrimp',   0, 2, FALSE)
ON CONFLICT (id) DO NOTHING;

-- modifier_group rows for the two new groups (the 'protein' group exists from 0004).
INSERT INTO public.modifier_group (id, name, label) VALUES
  ('protein-duro',    'Protein (Duro)',    'Choose one'),
  ('protein-seafood', 'Protein (Seafood)', 'Choose one')
ON CONFLICT (id) DO NOTHING;
```
`steak`/`chicken` already exist from `0004` with `sort_order` 1/2; `0006`'s
`DEFAULT FALSE` backfills their `double_meat_available`, so `0007` must `UPDATE` them to
`TRUE` (see 2d). `ON CONFLICT DO NOTHING` leaves existing rows unchanged, so that flag
flip is an explicit UPDATE, not a re-insert. **Why a dedicated `protein-duro` group:**
`modifier_option` rows belong to one group, and Duro must expose only its two meats
while Suave/Bravo/Supreme expose five; a dedicated group per distinct option set is the
smallest explicit model (no per-option-per-variant visibility table, no rules engine).

### 2c. Variant↔group links (selection rule + per-item double-meat price)
```sql
-- Each default variant links to its protein group with exactly-one; the link row
-- carries the per-item double-meat surcharge (NULL = not offered for this item).
INSERT INTO public.variant_modifier_group
  (variant_id, group_id, min_select, max_select, sort_order, double_meat_price_delta_cents) VALUES
  -- Suave's link to 'protein' already exists from 0004 (min/max 1/1); 0007 UPDATEs
  -- its double_meat_price_delta_cents to 150 (see 2d).
  ('taco-bravo-base',   'protein',         1, 1, 1, 150),   -- Bravo:   double meat +150
  ('taco-supreme-base', 'protein',         1, 1, 1, 299),   -- Supreme: double meat +299
  ('taco-duro-base',    'protein-duro',    1, 1, 1, NULL),  -- Duro:    no double meat
  ('taco-del-mar-base', 'protein-seafood', 1, 1, 1, NULL)   -- Del Mar: no double meat
ON CONFLICT (variant_id, group_id) DO NOTHING;
```

### 2d. Taco Suave is an intentional catalog-data change (not a migration rewrite)
Feature 1's `0004` seeded Suave with only **steak** and **chicken** and no double
meat. The confirmed rules **expand** Suave to five protein options and add a **+150**
double-meat surcharge. This is an **intentional catalog-data change**, applied by the
**new** migration `0007`, never by editing `0004`:
```sql
-- Mark the shared-group meats doubleable (0006 defaulted them FALSE); veggies stays FALSE.
UPDATE public.modifier_option SET double_meat_available = TRUE
  WHERE id IN ('steak','chicken','shredded-beef','shredded-chicken');
-- Add Suave's double-meat price on its existing 'protein' link.
UPDATE public.variant_modifier_group SET double_meat_price_delta_cents = 150
  WHERE variant_id = 'taco-suave-base' AND group_id = 'protein';
```
Because Suave, Bravo, and Supreme **share** the `protein` group, inserting the three new
options in 2b makes all five available to those three items at once (their links all
point at `protein`). `0004` stays byte-for-byte as shipped; the ledger keeps `0004`
recorded and adds `0007`.

**Rendering an item cleanly:** an item whose variant is not yet seeded (pending price)
is simply **omitted** from the category list (design §3b); it is never shown from
static data. There is no "empty modifier group" shipping path for these tacos anymore —
each listed taco carries its confirmed required-protein group.

---

## 3. API contract

### 3a. Existing single-item route — contract and behavior PRESERVED
`GET /api/menu/items/:itemId` keeps its Feature 1 **contract and behavior**: 200 with
the item body (design §3 there), 404 `{ "error": "item_not_found", "itemId": … }`, and
500 `{ "error": "internal_error" }`, with the same JSON field shape and the same
default-variant/no-merge semantics. We do not require byte-for-byte identical output
(e.g. incidental JSON key ordering or whitespace may differ); we require the documented
contract and observable behavior to be unchanged, and `taco-suave`'s response to remain
equivalent to Feature 1. The four new items become individually fetchable through this
same route for free (same query/mapper).

### 3b. New category list route — ONE exact contract
`GET /api/menu/categories/:categoryId` (this feature calls it with
`:categoryId = original-tacos`).

#### Success — HTTP 200 (with the confirmed protein + double-meat fields)
```json
{
  "category": "original-tacos",
  "items": [
    {
      "id": "taco-suave",
      "name": "Taco Suave",
      "description": "Soft corn tortilla taco with lettuce, cheese, and pico de gallo.",
      "variantId": "taco-suave-base",
      "basePriceCents": 525,
      "modifierGroups": [
        {
          "id": "protein",
          "label": "Choose one",
          "minSelect": 1,
          "maxSelect": 1,
          "doubleMeat": { "priceDeltaCents": 150 },
          "options": [
            { "id": "steak",            "name": "Steak",            "priceDeltaCents": 0, "doubleMeatAvailable": true  },
            { "id": "chicken",          "name": "Chicken",          "priceDeltaCents": 0, "doubleMeatAvailable": true  },
            { "id": "shredded-beef",    "name": "Shredded Beef",    "priceDeltaCents": 0, "doubleMeatAvailable": true  },
            { "id": "shredded-chicken", "name": "Shredded Chicken", "priceDeltaCents": 0, "doubleMeatAvailable": true  },
            { "id": "grilled-veggies",  "name": "Grilled Veggies",  "priceDeltaCents": 0, "doubleMeatAvailable": false }
          ]
        }
      ]
    },
    {
      "id": "taco-del-mar",
      "name": "Taco Del Mar",
      "description": "Choice of grilled fish (tilapia) or grilled shrimp with cabbage, pico de gallo, and our special white sauce.",
      "variantId": "taco-del-mar-base",
      "basePriceCents": 675,
      "modifierGroups": [
        {
          "id": "protein-seafood",
          "label": "Choose one",
          "minSelect": 1,
          "maxSelect": 1,
          "doubleMeat": null,
          "options": [
            { "id": "grilled-fish",   "name": "Grilled Fish",   "priceDeltaCents": 0, "doubleMeatAvailable": false },
            { "id": "grilled-shrimp", "name": "Grilled Shrimp", "priceDeltaCents": 0, "doubleMeatAvailable": false }
          ]
        }
      ]
    }
  ]
}
```
(Taco Duro uses a two-option `protein-duro` group with `doubleMeat: null`; Taco Bravo
mirrors Suave with `doubleMeat.priceDeltaCents: 150`; Taco Supreme with `299`. All five
base prices are confirmed, so every item is seeded and listed.)

Exact shape:
- Top level: `category` (the requested slug, echoed back) and `items` (an array).
- **Both endpoints return the SAME extended per-item JSON.** Each element of `items`
  uses the identical field shape as the single-item route's 200 body — all existing
  fields (`id`, `name`, `description`, `variantId`, `basePriceCents` integer,
  `modifierGroups[]` with each group's `id/label/minSelect/maxSelect/options[]` and
  each option's `id/name/priceDeltaCents`) **preserved**, plus the two additive
  double-meat fields below. One component renders either source.
- **Contract EXTENSION for double meat (new, additive fields — §1a):**
  - Each modifier group carries **`doubleMeat`**: `{ "priceDeltaCents": <int ≥0> }`
    when the item offers double meat on that group, else **`null`** (Duro, Del Mar).
    The surcharge is per item, from the variant↔group link.
  - Each option carries **`doubleMeatAvailable`** (boolean).
  - **Canonical availability rule:** double meat is offerable for a selection **iff
    BOTH** (a) the group's `doubleMeat` is non-null **and** (b) the currently selected
    option has `doubleMeatAvailable: true`. Both conditions are required; either alone
    is insufficient. (E.g. Suave's group has `doubleMeat` non-null, but selecting
    `grilled-veggies` — `doubleMeatAvailable:false` — makes double meat unavailable.)
  - These are the only additions. The **single-item route gains the same fields** (so
    `taco-suave` fetched singly also exposes them); existing fields and the 404/no-merge
    behavior are unchanged, and a client ignoring the new fields still renders a valid
    required-protein group (behavior preserved).
- **Display label:** the double-meat control's customer-facing label is **"Double
  meat"** (confirmed). Price shown as `+$X.XX` formatted from `doubleMeat.priceDeltaCents`.
- **UI obligation (from the contract):** the client renders one "Double meat (+$X.XX)"
  control bound to the selected protein; it is offerable only when the canonical rule
  above holds; selecting an option with `doubleMeatAvailable:false` (grilled veggies)
  clears any double-meat selection and its surcharge (FC4). Driven by the data fields,
  not by client-side special-casing of specific ids.
- **Scope of veggie/seafood "not doubleable":** `doubleMeatAvailable:false` on grilled
  veggies and seafood reflects **this milestone's confirmed Original Tacos rules**, not
  a permanent property of those foods or a global rule for every future menu item. The
  flag is per-option data; a future item/option may set it differently if confirmed.
- **Order:** `ORDER BY sort_order, id` (stable-ID tie-breaker), deterministic.

#### Empty category — HTTP 200
If the category exists conceptually but has no qualifying (active, has-active-default)
items, the body is `{"category":"original-tacos","items":[]}`. An **empty list is a
valid 200**, not a 404.

#### Omitted (unavailable) items — authoritative, no static fallback
An item that is inactive, or has **no active default variant**, is **omitted** from
`items` (the rest of the list still returns 200). Rules the frontend must honor:
- **A 200 response is authoritative for which items are available.** The items in
  `items` are exactly the available ones; any Original Tacos id **absent** from a
  successful response is treated as **unavailable** and is **not** rendered from the
  static `menu.js` as if it were live. Static data is a presentation fallback for
  metadata only (image/popular/note — §5), never a substitute that resurrects an item
  the API omitted.
- This mirrors the single-item route, which returns **404 `item_not_found`** for that
  same item; the two routes agree on availability.

#### Loading / error (frontend state mapping)
The HTTP layer has only 200 (success, incl. empty) and 500. The frontend hook derives
its states from the single category request:
- **loading** — request in flight; show loading affordance; never show stale items.
- **success** — 200; render exactly the returned `items` (authoritative). An empty
  `items` renders an empty-category state, not static items.
- **error** — network failure or 500 `internal_error`; show a friendly message +
  **Retry** (re-requests); do **not** fall back to static item data.
- **notFound** — reserved for an unknown category path if we later choose to 404 it;
  **for `original-tacos` the normal outcomes are success (incl. empty) or error.**

#### Server error — HTTP 500
`{ "error": "internal_error" }` on any thrown DB/mapping error (no SQL, credentials,
or stack), same as the single-item route.

### 3c. Query (proposed, parameterized)
Reuse `DEFAULT_VARIANT_SQL` shape per item. Two viable implementations:

- **Simple/clear:** one query to list the category's item ids in order
  (`SELECT id FROM public.menu_item WHERE category = $1 AND is_active ORDER BY sort_order, id`),
  then run the existing `queryDefaultVariant()` per id and `mapRowsToItem()` per item,
  dropping nulls. Minimal new SQL, maximal reuse, N+1 but N=5.
- **Single query:** a set-returning variant of the default-variant join filtered by
  category, mapped by a small grouping function. More efficient, more new SQL.

Design recommends the **reuse approach** for this small, fixed category; revisit if
categories grow large. Either way the item id / category slug are **parameters**.

---

## 4. Backend module layout (keeps backend files separate from frontend)

New/changed backend files (so the backend owner works here). **Migration numbering
(fixed order):**
- `server/migrations/0005_menu_item_category.sql` — additive `category`/`sort_order`
  columns + Taco Suave backfill (§1).
- `server/migrations/0006_double_meat_columns.sql` — additive
  `modifier_option.double_meat_available` + `variant_modifier_group.double_meat_price_delta_cents`
  columns (§1a). Schema only, no data.
- `server/migrations/0007_seed_original_tacos.sql` — the four items; the
  **price-confirmed** default variants (Del Mar now; others when confirmed); the
  confirmed protein groups/options; the variant↔group links with `min/max = 1/1` and
  per-item `double_meat_price_delta_cents`; and the intentional Taco Suave expansion
  (five options + 150 double meat) via explicit UPDATEs — **never editing `0004`** (§2).
- **`server/migrations/run_migrations.sh` — REQUIRED update (see §4a).** Append
  `0005`/`0006`/`0007` to the runner's fixed `MIGRATIONS` array, in order.
- `server/src/menu/queries.ts` — add `queryCategoryItemIds(category)` (new export) and
  extend `DEFAULT_VARIANT_SQL`'s SELECT to also return the new columns
  (`mo.double_meat_available`, `vmg.double_meat_price_delta_cents`). This **extends**
  the row shape additively; the existing fields and the 404/no-merge semantics are
  unchanged (contract preserved, not byte-identical).
- `server/src/menu/categoryRouter.ts` (new) — the list route, mounted in `index.ts`
  next to the existing router. A **new file** (not an edit to `router.ts`) so the
  single-item route and this route are owned separately.
- `server/src/menu/mapRows.ts` — extend `mapRowsToItem` to emit the additive
  `doubleMeat` (group-level, from the link column) and `doubleMeatAvailable` (per
  option) fields; all existing output fields unchanged. Add a tiny list-assembly
  helper (new function) for the category route.
- `server/migrations/README.md` — append `0005`/`0006`/`0007` to the apply-order table.

Runtime access: `menu_backend` already holds `SELECT` + a `FOR SELECT` RLS policy on
all five tables (`0003`). The new columns on `menu_item`, `modifier_option`, and
`variant_modifier_group` are all covered by the existing table-level grants; **no new
write grant, no new role.** If any new DB object (e.g. a view) is introduced, it gets
the same SELECT-only grant + read policy.

### 4a. Migration runner update is REQUIRED (not optional)
The runner `server/migrations/run_migrations.sh` does **not** auto-discover files. It
holds a **fixed, hard-coded ordered list**:

```bash
MIGRATIONS=(
  0001_create_catalog.sql
  0002_one_active_default.sql
  0003_access_policies.sql
  0004_seed_taco_suave.sql
)
```

and it also **validates the ledger as a literal prefix of this array**, stopping with
`FATAL: ledger is not a valid prefix…` on any unknown/out-of-order record. Consequences
for this feature:
- New files `0005`/`0006`/`0007` must be **appended to this array in order**
  or the runner will neither plan nor apply them.
- The array is also the prefix-validator's source of truth, so the new files must be
  appended **before** they are applied/recorded — otherwise a later run would reject a
  ledger that contains a filename absent from the array.
- This runner edit is a backend task (Track B) and a prerequisite of applying the new
  migrations (Track B apply step). It changes only the ordered list; the atomic
  apply/skip/stop-on-error logic is unchanged.

---

## 5. Frontend design — a reusable component (keeps frontend files separate)

New/changed frontend files (so the frontend owner works here):
- `src/components/MenuItemCard.jsx` (new) — generalized from `TacoSuaveCard`: props
  are the item data + fetch status + retry; renders loading / error+Retry /
  not-found / success, the price via `formatCents`, and the required protein group as
  radios (starts unselected, single-select). **Double meat:** when the group carries a
  `doubleMeat` object, render one "Double meat (+$X.XX)" control bound to the selected
  protein; it is **disabled** while the selected option's `doubleMeatAvailable` is
  false (grilled veggies), and switching the protein to such an option **clears** the
  double-meat selection and its surcharge (FC4). The control reads the data fields
  (`doubleMeat.priceDeltaCents`, option `doubleMeatAvailable`) — no hard-coded ids.
  Double meat is display-only state this milestone (no submission), like the protein
  selection. An item with no groups (should not occur for listed Original Tacos) still
  renders name + price + description cleanly.
- `src/components/TacoSuaveCard.jsx` — becomes a thin wrapper around `MenuItemCard`
  (or is removed and its usage replaced), so **Taco Suave behavior is unchanged**.
- `src/utils/useOriginalTacos.js` (new) — fetches `/api/menu/categories/original-tacos`
  with the same `loading|success|error|notFound` state machine as `useTacoSuave`.
- `src/utils/menuExplorer.js` — generalize `menuWithTacoSuave` into
  `menuWithCategory(sections, categoryData)` that overlays **all** fetched Original
  Tacos items (by id) into the menu **before** filtering, so displayed values, filter
  matches, and counts agree (AC7). Keep a `menuWithTacoSuave` shim if simpler, but the
  general version replaces the per-item special-case.
- `src/components/MenuSection.jsx` / `src/App.jsx` — render `MenuItemCard` for every
  Original Tacos item that has a stable `id`, in place; the pending-notice handling
  from Feature 1 generalizes to the category.

**Reuse-before-filter rule (from Feature 1, generalized):** on success, overlay each
API item's authoritative fields (`name`, `description`, price from `basePriceCents`)
onto the matching `menu.js` entry **matched by `id`** before `filterMenuItems`; while a
given item is not yet loaded, exclude just that item from filtering/counting (its card
still renders its own loading/notice in place). An item **omitted** from a successful
response is treated as unavailable and is **not** rendered from static data (design
§3b); static entries never resurrect an API-omitted item.

**Presentation metadata stays frontend (this milestone).** Category **note**
("Served with chips"), **images**, and **popularity** (`popular`) remain
**frontend-only presentation metadata** read from `menu.js`; they are **not** part of
the API contract for this feature and are not seeded into the database. (Whether any of
them should become DB data is deferred — see open questions / restaurant confirmation;
it is explicitly out of scope here.)

**Stable ids for ALL five items — reconciliation never keys on name.** Every Original
Tacos entry in `menu.js` carries a stable `id` so overlay/swap/exclusion match on the
immutable id, never on the display name (names may change in the DB, e.g. Feature 1's
"Taco Suave (DB test …)" rename). `taco-suave` already has its id; this feature adds
`id: "taco-duro"`, `"taco-bravo"`, `"taco-del-mar"`, `"taco-supreme"` to the other four
entries. This is the only `menu.js` change and it is additive. The matching key between
`menu.js` and the API is the `id` field and the category slug — not the name, note,
image, or popular flag.

---

## 6. Data flow (unchanged shape, generalized)
```
PostgreSQL (Supabase)  →  parameterized SQL (default variant per item, filtered by category)
  →  Express list route  →  GET /api/menu/categories/original-tacos (JSON array of item objects)
  →  useOriginalTacos hook (loading/success/error/notFound)
  →  menuWithCategory() overlays API items before filtering
  →  MenuItemCard per item, in place  →  browser
```

---

## 7. Verification plan (proving category data is DB-backed; no shared mutation here)
Mirrors Feature 1 §8, generalized. To be executed in a later turn, not now:
- **List endpoint:** `GET /api/menu/categories/original-tacos` returns all qualifying
  items ordered by `sort_order, id`, each with integer-cent prices and the §3b shape;
  an empty category returns 200 `items: []`.
- **Authoritative omission:** with one item made inactive/without-active-default, it is
  **absent** from the 200 list and the UI does **not** show it from static data; the
  single-item route returns 404 for that same id.
- **DB change reaches the UI:** edit one new item's name/price in dev → the list and
  the rendered card change on reload with no code change → revert (guarded, committed,
  with row counts, as in Feature 1's F1 record).
- **Default-variant / no-merge:** a non-default variant on a new item does not alter
  its list entry.
- **Confirmed-rule checks (FC1–FC5 from requirements):**
  - **FC1 exactly-one protein:** every item's protein group returns `minSelect:1,
    maxSelect:1`; UI starts unselected; a second protein pick replaces the first.
  - **FC2 same-protein double meat:** enabling double meat keeps the same protein id
    selected; never two proteins.
  - **FC3 each surcharge:** `doubleMeat.priceDeltaCents` = 150 (Suave), 150 (Bravo),
    299 (Supreme); `doubleMeat` null/absent for Duro and Del Mar.
  - **FC4 veggies clears double meat:** selecting grilled veggies
    (`doubleMeatAvailable:false`) disables + clears double meat and removes the
    surcharge.
  - **FC5 Del Mar seafood:** grilled fish/shrimp each `priceDeltaCents 0` on
    `basePriceCents 675`.
- **Single-item route contract/behavior preserved:** `GET /api/menu/items/taco-suave`
  and `…/taco-del-mar` behave per the F1 contract (200 shape, 404 `item_not_found`,
  500 `internal_error`); the additive `doubleMeat`/`doubleMeatAvailable` fields appear
  but existing fields and 404/no-merge semantics are unchanged — not asserting
  byte-identical output, but the documented contract preserved.
- **Filtering/counts:** category/search/price/popular filters and counts agree with
  the API values across the five items.
- **Read-only:** runtime role still rejected on writes (reuse F1's anon + runtime
  probes; re-run only the parts affected by new rows/columns).
- **Frontend preserved:** build, lint, existing routing/filter tests pass; Taco Suave
  and other categories unchanged.
- **Automated vs user-performed** evidence is labeled distinctly (as in Feature 1).

---

## 8. Explicitly out of scope (future)
Other categories; cart/checkout/pricing math/orders/payments/loyalty/accounts/auth;
Clover/kitchen printer; admin editing; modifier archival; any runtime write path;
and **any modifier/selection rule for the four items until restaurant-confirmed**.

## Next step
Implementation is organized in `tasks.md` (same folder), with backend and frontend
tasks separated so two people can work without editing the same files.
