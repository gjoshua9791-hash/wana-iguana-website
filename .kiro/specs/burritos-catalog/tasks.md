# Implementation Plan — Feature 3: Database-back the Burritos category

Draft for team review. Implements `requirements.md` + `design.md` (same folder),
building on Feature 1 (Taco Suave) and Feature 2 (Original Tacos).

**Branch:** `feature/burritos-catalog` (created from latest `origin/main`).

**Legend:** **AC refs** (requirements), **Files**, **Depends on**, **Done when**,
**Manual step? 🔧**.

## Guardrails (every task)
- **Reuse, don't rebuild.** The category route/query/mapper and the reconciliation
  helper already handle any category and multiple modifier groups — do not fork them.
- **Additive migrations only.** Never edit `0001`–`0007`. New files (`0008`+) tracked
  by the ledger; extend the runner's fixed list.
- **Runtime DB access stays read-only** (`menu_backend` SELECT + RLS read). No new
  write path; new rows need no new grant.
- **No inferred rules (AC8/AC12).** Encode only restaurant-confirmed burrito data. No
  taco rule (double meat, substitutions) carries over. The Wet Add On is an optional
  **modifier**, not a standalone item.
- **Preserve Features 1–2:** Original Tacos and other categories render unchanged; the
  app builds/lints and existing tests pass.

## Track separation (coordinate ownership)
- **Track C (confirmation):** restaurant answers — blocks the seeds they gate.
- **Track B (backend owner):** everything under `server/` — the seed migration, the
  runner list, migration docs. No `src/` edits.
- **Track F (frontend owner):** everything under `src/` — generalize the card +
  price helper, the category hook, `menu.js`, page wiring. No `server/` edits.
- **Shared contract = the API JSON in `design.md` §3** (multiple groups). Agree it
  before coding so B and F integrate without touching each other's files.
- The one shared file, `src/data/menu.js` (stable ids + removing the Wet Add On row),
  is owned by **Track F**.

---

## Track C — Restaurant confirmation (COMPLETE)

- [x] **Task C0 — Confirm burrito prices, protein choices, double portions, wet 🔧 — DONE**
All confirmed and recorded in `requirements.md` §Confirmed rules: seven base prices
(1549/1349/1349/1349/1599/1599/929); group A (Fajita/Super/Grande/Bravo) required
choose-one of five $0 proteins with +299 double for the four meats (veggies
ineligible); group B (Del Mar shrimp / Grilled Fish fish) fixed seafood in base, no
required choice, optional +349 same-seafood extra portion; Classic optional removable
added protein (+250 veggies / +299 meats / +349 seafood) with per-option double
(+299 meats / +349 seafood; none for veggies/none); wet upgrade +429 optional on all
seven, independent of protein/double. No taco rule carried over. Monster Diabla
excluded (comes wet by default).
- **AC refs:** AC1, AC4–AC8, AC12
- **Done when:** all values recorded (done). Only confirmed data is seeded.
- **Manual step?** 🔧 Yes — restaurant conversation (completed).

---

## Track B — Backend (all under `server/`)

- [x] **Task B1 — Additive migration: per-option double-portion column — DONE**
Add `modifier_option.double_portion_price_delta_cents` (§1a/§2a) — the smallest
extension that lets a single group price doubling per option (Classic +299 meats /
+349 seafood / NULL veggies).
- **AC refs:** AC7, AC11, AC12
- **Files:** `server/migrations/0008_double_portion_column.sql` (new) —
  `ALTER TABLE public.modifier_option ADD COLUMN double_portion_price_delta_cents
  INTEGER CHECK (… IS NULL OR … >= 0);`. Schema only; `0001`–`0007` untouched; covered
  by the existing SELECT grant.
- **Depends on:** — (schema only)
- **Done when:** nullable column added additively; transaction *body* (no BEGIN/COMMIT);
  schema-qualified.
- **Manual step?** No (applying is B4).

- [x] **Task B2 — Seed migration: seven burritos + variants + groups/options + wet — DONE**
Author `0009_seed_burritos.sql` with the confirmed data (three protein shapes + wet).
- **AC refs:** AC1, AC2, AC4, AC5, AC6, AC7, AC8, AC12
- **Files:** `server/migrations/0009_seed_burritos.sql` (new). `menu_item` rows
  (`category='burritos'`, `sort_order` per display order); one active default variant
  each (confirmed base cents 1549/1349/1349/1349/1599/1599/929).
  **Group A** (Fajita/Super/Grande/Bravo → shared `burrito-protein`, `min/max 1/1`):
  steak/chicken/shredded beef/shredded chicken `price_delta 0`,
  `double_portion_price_delta_cents 299`; grilled veggies `0`/`NULL`.
  **Group B** (Del Mar/Grilled Fish): **no required protein group**; one optional
  same-seafood extra-portion group `0/1` with a single option (`extra-shrimp` /
  `extra-fish`, `price_delta 349`).
  **Classic** (`classic-protein`, `0/1`, removable): distinct option ids with
  `price_delta` 250 (veggies, `double` NULL) / 299 (meats, `double` 299) / 349
  (seafood, `double` 349).
  **Wet** (`wet-upgrade`, option `wet` `price_delta 429`, `double` NULL) linked `0/1`
  to all seven. All links `double_meat_price_delta_cents = NULL` (burritos don't use
  the taco group-level amount). Schema-qualified, `ON CONFLICT DO NOTHING`. "Wet
  Burrito Add On" is a modifier, **not** a `menu_item`. Do not touch Monster Diabla.
- **Depends on:** B1, C0
- **Done when:** only confirmed rows seeded; limits (A `1/1`; B/Classic/wet `0/1`);
  per-option double values exactly as confirmed; no taco `doubleMeat` amount on burrito
  groups; `0001`–`0007` untouched.
- **Manual step?** No (applying is B4).

- [x] **Task B2a — REQUIRED: extend the migration runner's fixed list — DONE**
- **AC refs:** AC11
- **Files:** `server/migrations/run_migrations.sh` — append
  `0008_double_portion_column.sql` then `0009_seed_burritos.sql`, in order.
  `server/migrations/README.md` — append both to the apply-order table.
- **Depends on:** B1, B2.
- **Done when:** `run_migrations.sh --dry-run` lists `0008`/`0009` as `APPLY:` and the
  ledger prefix validator accepts the current ledger.
- **Manual step?** No.

- [x] **Task B3 — Surface `doublePortion` in query + mapper (additive) — DONE**
- **AC refs:** AC2, AC3, AC7, AC13
- **Files:** `server/src/menu/queries.ts` — add `mo.double_portion_price_delta_cents`
  to the default-variant SELECT + `DefaultVariantRow`. `server/src/menu/mapRows.ts` —
  emit per-option `doublePortion: { priceDeltaCents } | null`; `MenuOption` gains the
  field. All existing output (incl. taco `doubleMeat`/`doubleMeatAvailable`) unchanged.
  **No change to `categoryRouter.ts`** (already generic + multi-group).
- **Depends on:** B1
- **Done when:** the mapper emits `doublePortion` per option; taco output byte-shape
  for existing fields is unchanged; existing backend tests pass.
- **Manual step?** No.

- [ ] **Task B4 — 🔧 Apply 0008 + 0009 to shared Supabase (operator, tracked)**
- **AC refs:** AC11
- **Files:** none (operator action); ledger records `0008`,`0009`.
- **Depends on:** B1, B2, B2a
- **Done when:** dry-run shows only `0008`/`0009` pending, then a real run records them;
  ledger = `0001`–`0009`; a read-only SELECT confirms the new column values + rows;
  access controls unchanged.
- **Manual step?** 🔧 Yes — operator applies to shared Supabase. **Not in planning.**

---

## Track F — Frontend (all under `src/`)

- [ ] **Task F1 — Generalize `MenuItemCard`: multiple groups + per-option double**
Render every group; add a data-driven per-option double control; keep Feature 2 behavior.
- **AC refs:** AC3, AC4, AC5, AC6, AC7, AC7a, AC8, AC8b, AC13
- **Files:** `src/components/MenuItemCard.jsx` (+ `MenuItemCard.css` as needed).
- **Depends on:** shared contract (design §3), F2 (price helper)
- **Done when:** renders a required choose-one group as radios (starts unselected); an
  **optional** group (`min 0`) as radios + an explicit **"None"** (removable, AC6) or a
  checkbox for a single-option group (wet); per-group `double` control appears only
  when the **selected** option has a non-null `doublePortion`, labelled from the option
  name (meat vs seafood, AC8b), surcharge from the API (not hard-coded); **changing or
  removing the protein clears that group's double** (AC7a); state is a per-group map
  `{ optionId, double }`, independent per item, preserved across collapse; wet is
  independent of protein/double; Original Tacos' existing `doubleMeat` path still works
  unchanged (AC13); `modifierGroups: []` renders a plain row.
- **Manual step?** No (browser verification recorded later).

- [ ] **Task F2 — Generalize `configurePrice.js` (sum all groups + per-option double)**
- **AC refs:** AC7, AC8, AC8a
- **Files:** `src/utils/configurePrice.js` (+ its test).
- **Depends on:** shared contract
- **Done when:** configured cents = base + Σ over groups( selected option `priceDeltaCents`
  + (double checked & eligible ? that option's `doublePortion.priceDeltaCents` : 0) );
  the taco group-level `doubleMeat` path still works for taco groups; the **Classic
  examples hold exactly** (929/1179/1228/1527/1278/1627; wet +429 independent); existing
  Original Tacos helpers/tests pass (no regression); integer cents.
- **Manual step?** No.

- [ ] **Task F3 — Category hook parameterized by slug**
- **AC refs:** AC2, AC9, AC10
- **Files:** `src/utils/useCategory.js` (new) — `useCategory(slug)` with
  `loading|success|empty|error` + `retry`; migrate `useOriginalTacos` to it (or keep a
  thin wrapper). Endpoint built from the slug (`/api/menu/categories/${slug}`).
- **Depends on:** shared contract
- **Done when:** one hook serves both `original-tacos` and `burritos`; a failed call
  never surfaces as success; Original Tacos still works.
- **Manual step?** No.

- [ ] **Task F4 — Stable ids + remove the Wet Add On static row**
- **AC refs:** AC6, AC9, AC13
- **Files:** `src/data/menu.js` — add `id` to each confirmed Burritos entry (additive);
  **remove the "Wet Burrito Add On" item row** (it becomes the wet-upgrade modifier,
  not a standalone item). Keep image/popular/note as local metadata.
- **Depends on:** C0 (ids correspond to confirmed items)
- **Done when:** each confirmed burrito has a stable `id`; the Wet Add On is no longer
  a standalone item row; other categories' data untouched.
- **Manual step?** No.

- [ ] **Task F5 — Wire the Burritos category into the Menu page**
Reconcile + render Burritos like Original Tacos, reusing `menuWithCategory` and the
in-place loading/error+Retry/empty notice.
- **AC refs:** AC2, AC3, AC9, AC10, AC13
- **Files:** `src/App.jsx`, `src/components/MenuSection.jsx` (generalize to drive both
  categories from the category hook + `menuWithCategory`).
- **Depends on:** F1, F3, F4
- **Done when:** Burritos render in place in API order with their groups; the
  category notice shows regardless of active filters (as fixed in Feature 2);
  Original Tacos and other categories unchanged; build/lint clean; existing tests pass.
- **Manual step?** No.

- [ ] **Task F6 — Focused frontend tests (incl. Classic examples + taco regression)**
- **AC refs:** AC3–AC8, AC8a, AC13, AC14
- **Files:** tests near `src/utils/` using the existing `node --test` runner (no new
  framework). Cover:
  - **Classic pricing examples EXACTLY:** 929 / 1179 / 1228 / 1527 / 1278 / 1627, and
    wet +429 independently on each (AC8a).
  - Per-option double: A meats +299 / veggies ineligible; B optional seafood +349;
    Classic per-option add + double; double **clears on protein change/removal** (AC7a).
  - Required vs optional (removable "None") selection rules; multi-group summation.
  - Burritos reconciliation by `id` + authoritative omission + count agreement.
  - **Original Tacos regression:** existing taco `configurePrice`/reconciliation tests
    still pass unchanged (group-level `doubleMeat`, veggies clears, exactly-one).
- **Depends on:** F1, F2, F3, F5
- **Done when:** all the above pass and the taco tests are unchanged-green. Pure-logic
  tests (the component uses the same helpers) — NOT rendered-component/browser tests.
- **Manual step?** No.

- [ ] **Task F7 — Independent category states (manual, both categories)**
- **AC refs:** AC10, AC14
- **Files:** none (uses the git-ignored dev override targeting each category path).
- **Depends on:** F5
- **Done when:** user-performed browser check confirms Burritos and Original Tacos each
  show their own loading / error+Retry / empty states, and forcing an error/Retry on
  one category does not disturb the other or any static category. Record as
  user-performed (not automated); do not mark complete until observed.
- **Manual step?** 🔧 Yes (browser).

---

## Track V — Verification (after B+F integrate; mostly a later turn)

- [ ] **Task V1 — End-to-end Burritos proof**
Isolated-DB apply of `0001`–`0009` + assertions (groups/options/links; per-option
`double_portion_price_delta_cents` = meats 299 / seafood 349 / veggies NULL; Classic
adds 250/299/349; wet 429; limits A `1/1`, others `0/1`; Wet Add On not an item);
injected-HTTP category check (groups in order incl. additive `doublePortion`);
single-item route unchanged; then live + user-performed browser checks (protein + wet
render; double control label meat vs seafood; configured price incl. the Classic
examples; filters/counts; loading/error+Retry/empty). Distinguish automated vs
user-performed. 🔧 for dev-DB/browser.

- [ ] **Task V2 — Read-only + secret-leak reconfirmation**
Runtime role still read-only (reuse the probes); frontend bundle/source secret-leak
scan re-run after the Track F changes.

---

## Dependency summary
```
C0 ─> B2 ;  B1 ─> B2 ; B1 ─> B3 ; (B1,B2) ─> B2a ─> B4
shared contract ─> F1,F2,F3 ; F2 ─> F1 ; (F1,F3,F4) ─> F5 ; (F1,F2,F3,F5) ─> F6 ; F5 ─> F7
C0 ─> F4
(B3 + F5) ─> V1 ; (B*,F*) ─> V2
```
Backend (B/*) and frontend (F/*) proceed in parallel once the shared contract is
agreed; the only cross-track file is `src/data/menu.js`, owned by Track F.

## Out of scope (do not build here)
Other categories; cart/checkout/pricing/orders/payments/loyalty/accounts/auth; Clover/
kitchen printer; admin editing; modifier archival; any runtime write path; migrating
Original Tacos' double meat to a generic group; any burrito rule not confirmed via C0.
