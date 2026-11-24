# Design — Feature 3: Database-back the Burritos category

## Status
**Draft for team review.** Reuses Features 1–2 infrastructure. Prices/options below
are reference data from the static menu, **pending restaurant confirmation**; no taco
rule (double meat, substitutions) is assumed for burritos.

## Goal
Serve all confirmed **Burritos** from PostgreSQL via the existing category endpoint and
render them in place with the reusable card, **generalized to render multiple modifier
groups** (a required protein group where present, plus an optional "wet upgrade").

---

## 1. What already works (reuse, no structural change)
Verified against the current code:

- **Category route is generic.** `server/src/menu/categoryRouter.ts` serves
  `GET /api/menu/categories/:categoryId` for ANY category: it calls
  `queryCategoryItemIds(categoryId)`, then per id `queryDefaultVariant(id)` +
  `mapRowsToItem`, dropping nulls. **No new route or query is needed for burritos** —
  only a `category = 'burritos'` membership on the seeded items (the `menu_item.category`
  column already exists from migration `0005`).
- **Mapper already supports MULTIPLE modifier groups.** `mapRowsToItem` groups all
  rows by `group_id`, orders groups by `group_sort` and options by `option_sort`, and
  emits `modifierGroups: [...]`. A burrito with a protein group (sort 1) and a wet
  group (sort 2) already serializes correctly with **no mapper change**.
- **Schema already models optional groups.** `variant_modifier_group` carries
  `min_select`/`max_select` per variant↔group link, with
  `CHECK (max_select >= 1 AND max_select >= min_select)` and `min_select >= 0`. An
  optional single-choice group is simply `min_select = 0, max_select = 1` — already
  representable (migration `0001`). No schema change required for the wet upgrade.
- **Reconciliation is already category-parameterized.** `menuWithCategory(sections,
  cat, categoryName)` reconciles any named category by stable `id`. Reusable for
  "Burritos" as-is.

**Consequence:** the backend work is essentially a **seed migration** (plus the runner
list entry). The frontend work is **generalizing the card + hook** to multiple groups.

### Do NOT reuse the taco double-meat fields for the wet upgrade
`doubleMeat` (group-level) and `doubleMeatAvailable` (per-option) encode
protein-doubling for Original Tacos. The wet upgrade is a different concept (a sauce/
cheese topping surcharge) and is modeled as its **own optional modifier group** with a
priced option — NOT via the double-portion fields. Burrito protein groups also do not
use the taco group-level `doubleMeat` amount (see §1a: burrito doubling is per option).

---

## 1a. Smallest additive extension: PER-OPTION double-portion price
**Problem (from the confirmed Classic rules).** Original Tacos models double meat as a
**single group-level** surcharge: `modifier_group`-via-link `double_meat_price_delta_cents`
(one amount for the whole group) + a per-option boolean `double_meat_available`. That
cannot express Classic's optional-protein group, where doubling costs **+299 for meats**
but **+349 for seafood**, and **veggies / "no protein" cannot double at all** — three
different behaviors *within one group*. Forcing a single group-level amount would be
wrong, and hard-coding the per-option amounts in the frontend is disallowed.

**Smallest fix — one additive, nullable per-option column.** Add to `modifier_option`:
```sql
-- 0008 (additive): per-option extra-portion ("double") price. NULL = this option
-- cannot be doubled. A non-null value is the surcharge in integer cents for a second
-- portion of THIS option. Supersedes the group-level taco amount when present.
ALTER TABLE public.modifier_option
  ADD COLUMN double_portion_price_delta_cents INTEGER
  CHECK (double_portion_price_delta_cents IS NULL OR double_portion_price_delta_cents >= 0);
```
Semantics and why it is minimal:
- **Eligibility is "column is non-null."** A meat option sets `299`, a seafood option
  `349`, grilled veggies leaves it `NULL` (ineligible). No new table, no new boolean.
- **The API surfaces it per option** as an additive field (design §3):
  `doublePortion: { priceDeltaCents } | null` on each option. The frontend reads
  eligibility and the amount from this — never hard-coded.
- **Original Tacos is untouched.** The taco group-level `doubleMeat` +
  `double_meat_available` fields and their API shape/behavior are preserved exactly
  (AC13). Burrito options simply use the new per-option field; taco options keep using
  the existing group-level one. (A future cleanup could migrate tacos onto the
  per-option field, but that is out of scope and not required here.)
- **Label (meat vs seafood)** is derived from data, not hard-coded: either reuse the
  option's own name (e.g. "Double Shredded Beef", "Extra Shrimp") or add an optional
  per-option `doublePortionLabel`. Design proposes **deriving the control label from
  the option name** (no extra column); confirm in review.

**Mapper change (small, additive).** `mapRowsToItem` already emits per-option fields;
add `doublePortion` to each option from the new column
(`double_portion_price_delta_cents === null ? null : { priceDeltaCents }`). Existing
fields (incl. taco `doubleMeat`/`doubleMeatAvailable`) are unchanged. The query's
default-variant SELECT adds the one new column.

**Classic worked example (integer cents), proving the model:**
base 929; option delta from the chosen protein; optional double adds that option's
`doublePortion.priceDeltaCents`; wet adds 429 independently.
- none → 929; veggies → 929+250 = 1179 (veggies `doublePortion: null`);
- meat → 929+299 = 1228; meat doubled → 1228+299 = 1527;
- seafood → 929+349 = 1278; seafood doubled → 1278+349 = 1627; wet → +429 on any.

---

## 2. Schema + seed migrations (confirmed data)
Two additive migrations: `0008` adds the per-option double-portion column (§1a);
`0009` seeds the burritos. (Keeping the schema change and the seed in separate files
mirrors Feature 2's `0006` columns / `0007` seed split.)

### 2a. `0008_double_portion_column.sql` — the one additive column (§1a)
`ALTER TABLE public.modifier_option ADD COLUMN double_portion_price_delta_cents INTEGER
CHECK (… IS NULL OR … >= 0);` — nullable, covered by the runtime role's existing table
SELECT grant; `0001`–`0007` untouched; schema only.

### 2b. `0009_seed_burritos.sql` — items, variants, groups, options, links
Style of `0007`: schema-qualified, `ON CONFLICT DO NOTHING`, confirmed values only.

**Items + variants** (all seven; confirmed base cents): Fajita 1549, Super 1349,
Grande 1349, Bravo 1349, Del Mar 1599, Grilled Fish 1599, Classic 929; one active
default `<id>-base` each; `category='burritos'`, `sort_order` per display order.

**Protein groups — three distinct shapes:**
- **A — required choose-one** (Fajita/Super/Grande/Bravo share one group, e.g.
  `burrito-protein`, `min/max = 1/1`): options steak, chicken, shredded beef, shredded
  chicken (`price_delta_cents = 0`, `double_portion_price_delta_cents = 299`) and
  grilled veggies (`price_delta_cents = 0`, `double_portion_price_delta_cents = NULL`).
- **B — fixed seafood, no required choice** (Del Mar, Grilled Fish): **no protein
  group linked** (the seafood is in the base; no redundant choice). Each links an
  **optional same-seafood extra-portion** group `min/max = 0/1` with one option
  (`double`-portion is the *option* here): Del Mar → option `extra-shrimp`
  (`price_delta_cents = 349`); Grilled Fish → `extra-fish` (`price_delta_cents = 349`).
  (Modeled as a normal optional +349 option, since there is no base protein to
  "double" — the extra portion is itself the priced option.)
- **C — optional, removable, per-option added protein** (Classic; its own group
  `classic-protein`, `min/max = 0/1`): options with distinct ids because the base-add
  deltas differ from A — grilled veggies `+250` (`double`=NULL); steak/chicken/shredded
  beef/shredded chicken `+299` each (`double`=299); grilled fish/grilled shrimp `+349`
  each (`double`=349). `min_select = 0` gives the removable "None" state.

**Wet upgrade — reusable optional group, linked to all seven:**
```sql
INSERT INTO public.modifier_group (id, name, label) VALUES
  ('wet-upgrade', 'Wet upgrade', 'Make it wet?') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.modifier_option
  (id, group_id, name, price_delta_cents, sort_order, double_meat_available, double_portion_price_delta_cents)
  VALUES ('wet', 'wet-upgrade', 'Wet (red sauce + melted cheese)', 429, 1, FALSE, NULL)
  ON CONFLICT (id) DO NOTHING;
```

**Links** (`variant_modifier_group`, `double_meat_price_delta_cents = NULL` everywhere —
burritos do not use the taco group-level amount):
- A items → `burrito-protein` `min/max 1/1`, `sort_order 1`; + `wet-upgrade` `0/1`, `sort 2`.
- B items → their optional extra-seafood group `0/1`, `sort 1`; + `wet-upgrade` `0/1`, `sort 2`.
- Classic → `classic-protein` `0/1`, `sort 1`; + `wet-upgrade` `0/1`, `sort 2`.

> The "Wet Burrito Add On" static row becomes the `wet-upgrade` **modifier**, NOT a
> `menu_item`. **Monster Diabla is not touched** (future; comes wet by default).

The partial-unique-index (`0002`) and access policies (`0003`) already apply; runtime
role already has SELECT on all five tables (new rows/column need no new grant).

> **Shared vs distinct option ids (open modeling choice, not a price question):** A's
> and Classic's protein options differ in base-add delta (0 vs 250/299/349), so they
> need **distinct option rows** (an option row has one `price_delta_cents`). Design
> therefore uses a separate `classic-protein` group with its own option ids. Confirmed
> prices hold regardless; this is an id/grouping decision for review.

### Migration numbering & runner
- New files `0008_double_portion_column.sql`, `0009_seed_burritos.sql`.
- **Extend the runner's fixed `MIGRATIONS` array** (`server/migrations/run_migrations.sh`)
  to append `0008` then `0009`, in order — REQUIRED (the runner does not auto-discover
  files and validates the ledger as a literal prefix of its list; Feature 2 §4a).
- `server/migrations/README.md` — append `0008`/`0009` to the apply-order table.

---

## 3. API contract — existing shape + the additive per-option `doublePortion`
`GET /api/menu/categories/burritos` → the existing category contract, with one
**additive per-option field** `doublePortion` (§1a). The taco fields
(`doubleMeat`/`doubleMeatAvailable`) stay in the shape unchanged (null/false for
burritos). Examples (confirmed values):

**A — Burrito Grande (required protein with per-option double + wet):**
```jsonc
{
  "id": "burrito-grande", "name": "Burrito Grande", "variantId": "burrito-grande-base",
  "basePriceCents": 1349,
  "modifierGroups": [
    { "id": "burrito-protein", "label": "Choose one", "minSelect": 1, "maxSelect": 1, "doubleMeat": null,
      "options": [
        { "id": "steak",            "name": "Steak",            "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "chicken",          "name": "Chicken",          "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "shredded-beef",    "name": "Shredded Beef",    "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "shredded-chicken", "name": "Shredded Chicken", "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "grilled-veggies",  "name": "Grilled Veggies",  "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": null }
      ] },
    { "id": "wet-upgrade", "label": "Make it wet?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [ { "id": "wet", "name": "Wet (red sauce + melted cheese)", "priceDeltaCents": 429, "doubleMeatAvailable": false, "doublePortion": null } ] }
  ]
}
```

**B — Burrito Del Mar (fixed shrimp; optional +349 extra portion; wet):** no required
protein group; one optional group with a single `extra-shrimp` option
(`priceDeltaCents: 349`, `doublePortion: null` — the extra portion IS this option), plus
the wet group.

**C — Classic Burrito (optional removable added protein; per-option double; wet):**
```jsonc
{
  "id": "classic-burrito", "name": "Classic Burrito", "variantId": "classic-burrito-base",
  "basePriceCents": 929,
  "modifierGroups": [
    { "id": "classic-protein", "label": "Add a protein?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [
        { "id": "classic-grilled-veggies",  "name": "Grilled Veggies",  "priceDeltaCents": 250, "doubleMeatAvailable": false, "doublePortion": null },
        { "id": "classic-steak",            "name": "Steak",            "priceDeltaCents": 299, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "classic-grilled-shrimp",   "name": "Grilled Shrimp",   "priceDeltaCents": 349, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 349 } }
        /* …chicken/shredded beef/shredded chicken at 299 (double 299); grilled fish at 349 (double 349) */
      ] },
    { "id": "wet-upgrade", "label": "Make it wet?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [ { "id": "wet", "name": "Wet (red sauce + melted cheese)", "priceDeltaCents": 429, "doubleMeatAvailable": false, "doublePortion": null } ] }
  ]
}
```

Contract notes:
- **Additive field only:** each option gains `doublePortion: { priceDeltaCents } | null`
  (`null` = cannot be doubled). All existing fields are unchanged; a client ignoring
  `doublePortion` still renders valid groups. The single-item route gains the same
  field; its contract/behavior is preserved (AC13).
- **Original Tacos unchanged:** taco options keep `doubleMeatAvailable` + the group's
  `doubleMeat` amount and do not rely on `doublePortion`.
- A burrito with `modifierGroups: []` renders a plain row. Authoritative-omission and
  empty-category behavior are unchanged from Feature 2.

---

## 4. Backend module layout (keeps backend files separate)
New/changed backend files (Track B):
- `server/migrations/0008_double_portion_column.sql` (new) — the one additive
  `modifier_option.double_portion_price_delta_cents` column (§1a/§2a).
- `server/migrations/0009_seed_burritos.sql` (new) — seven burritos + variants + the
  three protein shapes + the `wet-upgrade` group/option + variant↔group links
  (confirmed data only; §2b).
- `server/migrations/run_migrations.sh` — append `0008` then `0009` to the fixed list
  (REQUIRED). `server/migrations/README.md` — append both to the apply-order table.
- `server/src/menu/queries.ts` — add `mo.double_portion_price_delta_cents` to the
  default-variant SELECT and the `DefaultVariantRow` type (additive; existing
  columns/semantics unchanged).
- `server/src/menu/mapRows.ts` — emit the per-option `doublePortion` field
  (`null` when the column is null); the `MenuOption` type gains `doublePortion`. All
  existing output (incl. taco `doubleMeat`/`doubleMeatAvailable`) is unchanged.
- **No change** to `categoryRouter.ts` — it already serves any category and the mapper
  already emits multiple groups. No new route/query function is needed.

---

## 5. Frontend design — generalize the card to multiple groups (Track F)
The reusable card and helpers are the real frontend work: today they are single-group,
taco-double-meat-specific, and read `modifierGroups[0]` only.

New/changed frontend files:
- `src/components/MenuItemCard.jsx` — **generalize** to render **every** group:
  - **required single-choice group** (`minSelect = 1, maxSelect = 1`): native radios,
    one `name` per (item, group), starts unselected.
  - **optional single-choice group** (`minSelect = 0, maxSelect = 1`): e.g. Classic's
    optional protein and the wet upgrade. Starts **off**, with an explicit **"None"**
    affordance so the selection is removable (AC6). A single-option optional group
    (wet) renders as a checkbox; a multi-option optional group (Classic protein)
    renders radios plus a "None" choice.
  - **per-option double portion:** when the *selected* option in a group has a non-null
    `doublePortion`, render one extra-portion control for that group (checkbox). Its
    surcharge is `option.doublePortion.priceDeltaCents` (from the API, never
    hard-coded). Ineligible options (`doublePortion: null` — veggies, "None", wet) show
    no double control. This replaces the taco-only hardcoded "Double meat" checkbox
    with a data-driven one.
  - **label (meat vs seafood):** the double control's label is derived from data — use
    the selected option's name (e.g. "Add another Shredded Beef" / "Add another Grilled
    Shrimp") so meat vs seafood reads correctly without per-item hard-coding.
  - **clear double on protein change/removal (AC7a):** when the selected option in a
    group changes or is removed, clear that group's double-portion flag; re-enabling
    requires a fresh opt-in (same rule Feature 2 applied to tacos, now per group).
  - **state model:** a per-card map `selections[groupId] = { optionId|null,
    double: boolean }`, independent per group and per item, preserved across collapse.
  - **preserve Feature 2:** Original Tacos items still carry the group-level
    `doubleMeat` + per-option `doubleMeatAvailable`. The card keeps honoring that path
    for a group that has `doubleMeat` (taco behavior unchanged), and uses the new
    per-option `doublePortion` path for burritos. Both converge on the same "double"
    sub-control UI; only the data source of eligibility/amount differs. (A future
    cleanup could unify tacos onto `doublePortion`; out of scope.)
- `src/utils/configurePrice.js` — **generalize** to:
  `base + Σ over groups( selected option priceDeltaCents + (double checked & eligible ?
  that option's double surcharge : 0) )`. The double surcharge per option comes from
  `doublePortion.priceDeltaCents` (burritos) or the taco group-level `doubleMeat`
  amount when a group uses that older shape. Keep the existing taco helper signatures/
  behavior working so Original Tacos tests pass unchanged. Integer cents throughout.
- `src/utils/useCategory.js` (new) OR parameterize `useOriginalTacos` — a category
  hook taking a slug: `useCategory('burritos')` / `useCategory('original-tacos')`,
  same `loading|success|empty|error` + `retry`. Avoids a per-category copy.
- `src/data/menu.js` — add stable `id` to each confirmed Burritos entry (additive),
  and **remove/convert the "Wet Burrito Add On" row** so it is not a standalone item
  (it becomes the wet-upgrade modifier). Keep image/popular/note as local metadata.
- `src/App.jsx` / `src/components/MenuSection.jsx` — reconcile and render the Burritos
  category the same way Original Tacos is (via `menuWithCategory` + the category hook),
  including the in-place loading/error+Retry/empty notice. Both categories use the
  same reusable card and notice component.

**Selection-state model (per card):** `selections[groupId] = { optionId: string|null,
double: boolean }`.
- required group: `optionId` starts `null`, exactly one; choosing replaces and (per
  AC7a) resets that group's `double` to `false`.
- optional group: `optionId` is `null` (None/off) or an option id; removing it resets
  `double` to `false`.
- `double` can be set true only when the selected option is double-eligible; changing/
  removing the option clears it (fresh opt-in required).
- configured price recomputes from `selections` over all groups via
  `configuredPriceCents` (integer cents).

**Preserve Feature 2:** Original Tacos behavior (exactly-one protein; double offered
only when both the group/option conditions hold; veggies clears double) is unchanged —
covered by keeping the taco helper path + its tests and by not altering taco group
data. Burritos use the per-option `doublePortion` path instead.

---

## 6. Verification plan (later turn; no shared mutation here)
Mirrors Features 1–2, generalized. Automated vs user-performed kept distinct.
- **Automated (pure logic) — the Classic examples must hold EXACTLY (integer cents):**
  no additions 929; veggies 1179; meat 1228; meat doubled 1527; seafood 1278; seafood
  doubled 1627; and **wet adds 429 independently** to each. Also: A-group meat double
  +299 / veggies ineligible; B optional extra seafood +349; required-vs-optional
  selection rules; **double clears on protein change/removal (AC7a)**; reconciliation
  of the Burritos category by id; authoritative omission; count agreement.
- **Taco regression (automated):** the existing Original Tacos `configurePrice` and
  reconciliation tests still pass unchanged (group-level `doubleMeat`, veggies clears,
  exactly-one) — the generalization must not alter taco behavior or API fields.
- **Isolated-DB (local, disposable):** apply `0001`–`0009` into a throwaway DB via the
  real runner; assert groups/options/links and the new `double_portion_price_delta_cents`
  values (meats 299, seafood 349, veggies NULL; Classic adds 250/299/349; wet 429),
  the selection limits (A `1/1`; B/Classic/wet `0/1`), and that the Wet Add On is NOT a
  `menu_item` row.
- **Injected HTTP test:** the category route returns burritos with their groups in
  order incl. the additive `doublePortion` per option (reuse the Feature 2 injection
  seam). The single-item route is unchanged.
- **Independent category states (automated + browser):** Burritos and Original Tacos
  each have their own loading / error+Retry / empty state; forcing an error (or Retry)
  on one category does not disturb the other or any static category (AC14). Use the dev
  override targeting each category path separately.
- **Live (after rollout) + browser (user-performed):** a burrito renders its groups;
  selecting a meat shows the data-driven double control (meat vs seafood label) and
  the configured total updates; switching protein clears double; wet adds 429
  independently; Classic "None" removes the protein; filters/counts agree. Distinguish
  automated vs user-performed.
- **Read-only / secret-leak:** reuse the existing probes; re-run the frontend
  bundle/source secret scan after the frontend changes.

### 6a. Operator rollout order (shared Supabase — a later, human-run step)

0008/0009 are additive and must be applied to the shared database by the
migration operator (role `postgres`), in order, BEFORE the backend that queries
the new column is deployed. The checkpoint on `feature/burritos-catalog` does NOT
run these against Supabase.

1. **Dry-run (read-only):**
   `DB_URL="postgresql://.../postgres" server/migrations/run_migrations.sh --dry-run`
   Confirm the plan shows `0001`–`0007` as `SKIP (recorded)` and `0008`,`0009` as
   `APPLY`. This creates nothing.
2. **Apply:** `DB_URL="postgresql://.../postgres" server/migrations/run_migrations.sh`
   The runner applies `0008_double_portion_column.sql` then
   `0009_seed_burritos.sql`, each atomic with its ledger INSERT.
3. **Restart/deploy the backend** so it serves the Burritos category.

**Schema-before-code constraint:** `queries.ts` selects
`mo.double_portion_price_delta_cents`, which exists only after 0008. Do NOT run a
backend build that contains this SELECT against a database where 0008 has not been
applied — it would error on every menu query. Order is strictly: apply 0008 (and
0009) first, then deploy the new backend. Rolling back the backend to the previous
release is safe at any time; the additive column and seed can remain.

## 7. Explicitly out of scope
Other categories; cart/checkout/pricing math/orders/payments/loyalty/accounts/auth;
Clover/kitchen printer; admin editing; modifier archival; any runtime write path; any
burrito rule not restaurant-confirmed; and migrating Original Tacos' double meat to a
generic group (possible future cleanup, not part of this feature).

## Next step
`tasks.md` (same folder) organizes the work with backend (Track B) and frontend
(Track F) separated for parallel ownership.
