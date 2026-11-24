# Implementation Plan — Feature 2: Database-back the Original Tacos category

Draft for team review. Implements `requirements.md` + `design.md` (same folder),
building on the completed Feature 1 (`.kiro/specs/taco-suave-menu-api/`).

**Branch:** `feature/original-tacos-catalog` (created from latest `origin/main`).

**Legend** — same as Feature 1: **AC refs**, **Files**, **Depends on**, **Done when**,
**Manual step? 🔧**.

## Guardrails (apply to every task)
- **Additive migrations only.** Never edit applied migrations `0001`–`0004`. New work
  is new files (`0005`+), tracked by the existing ledger via `run_migrations.sh`.
- **Runtime DB access stays read-only** (`menu_backend` SELECT + RLS read policy). No
  new write grant, no new role. New columns are covered by the existing table grant.
- **Preserve Feature 1:** `GET /api/menu/items/:itemId` and Taco Suave's rendered
  behavior are unchanged; existing routing/filter tests keep passing.
- **No inferred menu rules (AC11).** Do not encode any modifier charge or
  selection rule for the four non-Taco-Suave items until the restaurant confirms it
  (see Track C). Items may ship with `modifierGroups: []` until then.
- **Credentials stay server-side**; the frontend calls only relative `/api` URLs.

## Track separation (so two people don't edit the same files)
- **Track B (Backend owner):** everything under `server/` — migrations, queries,
  the new category route, mapper helpers, backend docs.
- **Track F (Frontend owner):** everything under `src/` — the reusable component,
  the category hook, the menu-overlay generalization, the in-place swap.
- **Shared contract = the JSON in `design.md` §3.** Agree it before coding so B and F
  integrate without touching each other's files.
- **The one shared file is `src/data/menu.js`** (adding stable ids). Assign it to
  **Track F** only; Track B never edits `src/`. `server/src/menu/index.ts` mounting is
  Track B only.
- To avoid both editing `server/src/menu/router.ts`, Track B adds a **new**
  `categoryRouter.ts` rather than extending the existing router.

---

## Track C — Restaurant confirmation (COMPLETE)

- [x] **Task C0 — Confirm prices, proteins, and the double-meat label 🔧 — DONE**
All five base prices confirmed current: Taco Suave 525, Taco Duro 525, Taco Bravo 525,
Taco Supreme 850, Taco Del Mar 675 (cents). Protein options, required exactly-one,
$0 base-protein deltas, and double-meat surcharges (Suave/Bravo +150, Supreme +299;
none for Duro/Del Mar) with the same-meat/veggies-exclusion dependency are confirmed.
Double-meat display label confirmed as **"Double meat"**. Recorded in
`requirements.md`.
- **AC refs:** AC1, AC8, AC11, AC12, AC13, AC14, AC15
- **Done when:** all prices + rules + label recorded in the spec (done). Nothing
  remains pending for seeding.
- **Manual step?** 🔧 Yes — restaurant conversation (completed).

> **All confirmations are in** (Track C0 complete): five base prices, protein options,
> exactly-one, double-meat surcharges + dependency, and the "Double meat" label. Every
> item is seedable; the authoritative-omission rule still governs an item that is ever
> inactive/without-active-default at runtime.

---

## Track B — Backend (all under `server/`)

- [x] **Task B1 — Additive migration: `menu_item.category` + `sort_order`**
Add nullable `category` and defaulted `sort_order` columns and backfill Taco Suave.
- **AC refs:** AC1, AC10
- **Files:** `server/migrations/0005_menu_item_category.sql` (ALTER TABLE ADD COLUMN
  ×2; `UPDATE menu_item SET category='original-tacos', sort_order=1 WHERE id='taco-suave'`
  — expect 1 row); append to `server/migrations/README.md` apply-order table.
- **Depends on:** — (schema only; no price confirmation needed)
- **Done when:** file is a transaction *body* (no `BEGIN`/`COMMIT`), schema-qualified,
  strictly **additive** (only ADD COLUMN + a one-row backfill; no table create/drop,
  no edit to `0001`–`0004`); category slug is the stable `'original-tacos'`; runtime
  role needs no new grant (existing table-level `SELECT` covers new columns — note this
  in the file).
- **Manual step?** No (applying to the shared DB is a tracked operator step — see B6).

- [x] **Task B1b — Additive migration: double-meat columns**
Add the two columns that represent the double-meat↔protein dependency (design §1a).
- **AC refs:** AC14, AC16, AC10
- **Files:** `server/migrations/0006_double_meat_columns.sql` —
  `ALTER TABLE public.modifier_option ADD COLUMN double_meat_available BOOLEAN NOT NULL
  DEFAULT FALSE;` and `ALTER TABLE public.variant_modifier_group ADD COLUMN
  double_meat_price_delta_cents INTEGER CHECK (… IS NULL OR … >= 0);`. Append to
  README apply-order table.
- **Depends on:** — (schema only)
- **Done when:** both columns added additively (safe default / nullable), transaction
  *body* (no `BEGIN`/`COMMIT`), schema-qualified; `0001`–`0004` untouched; covered by
  the existing table-level `SELECT` grants (no new grant).
- **Manual step?** No (applying is B6).

- [x] **Task B1a — REQUIRED: extend the migration runner's fixed list**
The runner does not auto-discover files; it holds a hard-coded ordered `MIGRATIONS`
array and validates the ledger as a literal prefix of it (see `design.md` §4a).
- **AC refs:** AC10
- **Files:** `server/migrations/run_migrations.sh` — append `0005_menu_item_category.sql`,
  `0006_double_meat_columns.sql`, `0007_seed_original_tacos.sql` to the
  `MIGRATIONS=( … )` array, in order. No change to its apply/skip/stop-on-error logic.
- **Depends on:** B1, B1b (files must exist to be listed); keep in lockstep with B2.
- **Done when:** `run_migrations.sh --dry-run` lists the new files as `APPLY:` (and the
  prefix validator accepts the current ledger); array order matches filename order.
- **Manual step?** No.

- [x] **Task B2 — Additive seed: items, confirmed variants, protein groups, options, links, double meat**
Seed the four items, their **price-confirmed** default variants, the confirmed protein
groups/options with `double_meat_available`, and the variant↔group links carrying
`min/max = 1/1` and per-item `double_meat_price_delta_cents`; plus the **intentional
Taco Suave expansion** (five options + 150 double meat) via explicit UPDATEs.
- **AC refs:** AC1, AC4, AC8, AC11, AC12, AC13, AC14, AC15, AC16
- **Files:** `server/migrations/0007_seed_original_tacos.sql` (style of `0004`:
  schema-qualified, `ON CONFLICT DO NOTHING` for inserts, explicit `UPDATE` for the
  Suave expansion). **Never edits `0004`.**
- **Depends on:** B1, B1b, C0 (all five prices confirmed)
- **Done when:** items seeded with `category`/`sort_order` 2–5; **all four** default
  variants seeded (Duro 525, Bravo 525, Supreme 850, Del Mar 675; Suave 525 already in
  0004); confirmed protein options present with correct `double_meat_available`
  (meats TRUE, grilled veggies & seafood FALSE); each variant↔protein link has
  `min/max = 1/1` and the confirmed `double_meat_price_delta_cents` (Suave/Bravo 150,
  Supreme 299, Duro/Del-Mar NULL); the Suave `UPDATE`s add the three new options,
  mark meats doubleable, and set its 150 surcharge **without editing `0004`**; no
  modifier charge or rule beyond the confirmed set; no note/image/popular seeded
  (frontend-only). Per-item option subsets use a dedicated group where needed
  (`protein`=5, `protein-duro`=2, `protein-seafood`=2 — design §2b).
- **Manual step?** No (applying is B6).

- [x] **Task B3 — Category item-id query**
Add a parameterized query returning the active items of a category in display order.
- **AC refs:** AC1, AC2, AC9, AC14
- **Files:** `server/src/menu/queries.ts` — add `queryCategoryItemIds(category)`
  (`SELECT id FROM public.menu_item WHERE category=$1 AND is_active ORDER BY
  sort_order, id`), and **additively extend `DEFAULT_VARIANT_SQL`'s SELECT** to also
  return `mo.double_meat_available` and `vmg.double_meat_price_delta_cents`
  (`DefaultVariantRow` gains two fields). The CTE/joins/404/no-merge semantics are
  unchanged.
- **Depends on:** B1, B1b
- **Done when:** both queries are parameterized (`$1`); the default-variant query
  returns the two new columns without changing existing fields or the no-merge/404
  behavior; `queryDefaultVariant` signature unchanged.
- **Manual step?** No.

- [x] **Task B3m — Mapper emits the additive double-meat fields**
Extend the row→JSON mapper to surface the dependency fields.
- **AC refs:** AC14, AC15, AC16
- **Files:** `server/src/menu/mapRows.ts` — in `mapRowsToItem`, set each group's
  `doubleMeat` to `{ priceDeltaCents }` when the link's
  `double_meat_price_delta_cents` is non-null (else `null`), and each option's
  `doubleMeatAvailable` from `double_meat_available`. All existing output fields
  unchanged.
- **Depends on:** B3
- **Done when:** output matches design §3b (group `doubleMeat`, option
  `doubleMeatAvailable`); Taco Suave fetched singly also exposes them; existing fields
  and ordering unchanged.
- **Manual step?** No.

- [x] **Task B4 — Category list route (new file) + list assembly**
Add `GET /api/menu/categories/:categoryId` reusing the per-item query+mapper.
- **AC refs:** AC2, AC3, AC4
- **Files:** `server/src/menu/categoryRouter.ts` (new); mount in
  `server/src/index.ts`. A small `mapCategory()` helper (new function) that calls
  existing `queryDefaultVariant` + `mapRowsToItem` per id and drops nulls. **Do not
  edit** `router.ts`.
- **Depends on:** B3, B3m, D2/D3 of Feature 1 (already done)
- **Done when:** `GET /api/menu/categories/original-tacos` → 200 with `items[]` ordered
  by `sort_order, id`, matching the **exact contract in `design.md` §3b** (incl. the
  `doubleMeat`/`doubleMeatAvailable` fields); items with no active default variant
  omitted; empty category → 200 `items: []`; thrown error → 500 `internal_error`; the
  single-item route's **contract and behavior are preserved** (verify
  `…/items/taco-suave` still meets the F1 contract, with the additive fields — not
  asserting byte-identical output).
- **Manual step?** No.

- [x] **Task B6 — 🔧 Apply new migrations to the shared dev DB (operator, tracked)**
Apply `0005`/`0006`/`0007` with the tracked runner; never re-run applied ones.
- **AC refs:** AC10
- **Files:** none (operator action); ledger records the new filenames.
- **Depends on:** B1, B1b, **B1a (runner list extended)**, B2
- **Done when:** `run_migrations.sh --dry-run` shows only the new files pending (it will
  not even see them unless B1a extended the array), then a real run records them in
  `schema_migrations`; access controls unchanged; a SELECT confirms the new rows,
  columns, and the Suave expansion.
- **DONE (user-executed against shared Supabase, screenshots):** 0005–0007 applied;
  ledger = 0001–0007; follow-up dry-run skipped all seven; post-migration SQL returned
  all five tacos with expected prices, selection limits, double-meat surcharges, and
  option counts. See `server/VERIFICATION.md` → "Feature 2 — shared Supabase rollout".
- **Manual step?** 🔧 Yes — operator applied to the shared Supabase DB (completed).

---

## Track F — Frontend (all under `src/`)

> **Agreed presentation and build plan: see `frontend-handoff.md` (same folder).**
> It captures the compact-rows + expandable "Choose options" UX, the exactly-one /
> double-meat / veggies-clears rules, and the authoritative-no-static-fallback rule,
> mapped to F1–F5. **Implemented** this session (build/lint/tests + live HTTP wiring
> verified); the **browser-interaction checks remain pending** (see
> `server/VERIFICATION.md` → "Feature 2 — frontend").

- [x] **Task F1 — Reusable `MenuItemCard` component**
A component that renders any API-backed catalog item: compact row + expandable
"Choose options".
- **AC refs:** AC5, AC6, AC12, AC14, AC15, AC16
- **Files:** `src/components/MenuItemCard.jsx` + `src/components/MenuItemCard.css`
  (scoped); `src/utils/configurePrice.js` (pure selection/price helpers). The old
  `TacoSuaveCard.jsx`/`.css` and `useTacoSuave.js` were removed (superseded).
- **DONE (code + automated):** compact row (reuses `.menuRow`); accessible "Choose
  options" button (`aria-expanded`/`aria-controls`), collapsed by default; native
  labeled protein radios with a unique `name` per item, starts unselected,
  single-select; selection persists across collapse (state above the render). Double
  meat shown only when BOTH `group.doubleMeat` non-null AND selected option
  `doubleMeatAvailable`; switching to veggies clears it; switching back to meat does
  not auto-enable; driven by data, no hard-coded ids. Configured price = base + option
  delta + eligible checked surcharge; base vs configured shown distinctly. Unit-tested
  via `configurePrice.test.js`. Price presentation refined to labelled
  "Base $5.25 / With options $6.75" (no strikethrough), wrapping on narrow screens.
- **Browser verification DONE (user-performed, Safari):** collapsed/expansion;
  initially-unselected + exactly-one; independent selections; selection preserved
  across collapse/reopen; double-meat totals ($6.75 Suave/Bravo, $11.49 Supreme);
  veggies clears + no auto-re-enable; Duro/Del Mar never offer double meat; Option+Tab
  + Space keyboard; revised price labels visible/correct (screenshot). See
  `server/VERIFICATION.md`.
- **Manual step?** Browser check complete.

- [x] **Task F2 — `useOriginalTacos` hook**
Fetch the whole category as the single source (replaces the per-item Taco Suave fetch).
- **AC refs:** AC2, AC5
- **Files:** `src/utils/useOriginalTacos.js` (new) — `fetch('/api/menu/categories/
  original-tacos')`, states `loading|success|empty|error`, `retry`.
- **DONE:** relative URL via the dev proxy; `success` only on 200 with a non-empty
  `items[]`; `empty` on 200 `items: []`; `error` on network/non-2xx; a failed call
  never surfaces as success. Live HTTP wiring confirmed (200 + five items in order).
- **Manual step?** No.

- [x] **Task F3 — Generalize the menu overlay + stable ids**
Overlay all fetched category items before filtering; add stable ids to the four entries.
- **AC refs:** AC6, AC7, AC8, AC17
- **Files:** `src/utils/menuExplorer.js` — `menuWithCategory(sections, cat,
  categoryName)` (replaces `menuWithTacoSuave`). `src/data/menu.js` — added `id` to the
  four entries (additive). Tests: `src/utils/originalTacosMenu.test.js`.
- **DONE:** overlay matches by **`id`** (not name); on success, displayed name/price
  and filter matches + counts agree; an **API-omitted item is dropped** (no static
  fallback); non-success empties the category from filtering/counting; local
  `image`/`popular`/note preserved; max-price uses the API **base** price. Existing
  filter/routing tests still pass (17/17 total).
- **Manual step?** No.

- [x] **Task F4 — In-place swap for the whole category**
Render `MenuItemCard` for every API-backed Original Tacos item, in order.
- **AC refs:** AC5, AC6, AC12, AC13
- **Files:** `src/components/MenuSection.jsx` (renders `MenuItemCard` for items with an
  `apiItem`, else `MenuItem`); `src/App.jsx` (MenuPage uses `useOriginalTacos` +
  `menuWithCategory`; category-level loading/error+Retry/empty notice in the Original
  Tacos slot; other categories untouched).
- **DONE (code + automated + HTTP wiring):** each item appears once, in API order;
  other categories unchanged; build/lint clean; routing/filter tests pass.
- **Browser verification DONE (user-performed, Safari):** five items render in place
  in order (success); category **loading → success**, **empty** notice (no static
  replacement), and **error → Retry → success** all observed via the dev override;
  narrow desktop-window layout (not a physical phone). See `server/VERIFICATION.md`.
- **Manual step?** Browser check complete.

- [x] **Task F5 — Focused checks for the confirmed rules (FC1–FC5)**
Add automated and/or user-performed checks for the confirmed protein + double-meat
rules, using the existing `node --test` runner (no new framework).
- **AC refs:** AC12, AC13, AC14, AC15, AC16
- **Files:** a sibling test near `src/utils/` for the pure selection/double-meat state
  logic (exactly-one; double meat stays same protein; per-item surcharge value;
  veggies clears + disables double meat; Del Mar seafood $0). Component-level keyboard/
  visual behavior is a user-performed browser check (recorded later), as in Feature 1.
- **Depends on:** F1, F3
- **Automated half DONE:** `src/utils/configurePrice.test.js` covers FC1 (exactly-one
  via single-select + the offered/clear rules), FC2 (double meat keeps the same
  protein — it is a flag on the selected option, never a second protein), FC3 (each
  surcharge 150/150/299; none for Duro/Del Mar), FC4 (veggies clears + double meat not
  offered), FC5 (Del Mar seafood $0, no surcharge). The `MenuItemCard` component uses
  these exact helpers (not a re-implementation). Pure-logic tests, **not** a rendered-
  component/browser test.
- **Browser half DONE (user-performed, Safari):** keyboard operation (Option+Tab +
  Space), visible selection, independent selections across tacos, and the rendered
  surcharge/veggie-clear behavior all observed; recorded in `server/VERIFICATION.md`.
- **Manual step?** 🔧 Browser portion complete (user-performed Safari, not automated).

---

## Track V — Verification (after B+F integrate; mostly a later turn)

- [x] **Task V1 — End-to-end category proof (design §7)**
List endpoint returns all qualifying items in order; an omitted item is absent from the
200 list and not shown from static data; a dev DB value change reaches the list and the
rendered card (guarded, committed, reverted with row counts — Feature 1 F1 style);
default-variant/no-merge holds; single-item route contract/behavior preserved;
filters/counts agree; runtime role still read-only; frontend build/lint/tests pass.
Record in a
`server/VERIFICATION.md` section (or a feature-scoped verification doc), labeling
automated vs user-performed checks. 🔧 for the dev-DB edits.
- **Backend half DONE (user-executed, shared Supabase, screenshots):** live category
  endpoint returned all five items in order with the correct extended JSON; post-
  migration SQL confirmed prices/limits/surcharges/option counts;
  `verify_d1_connection.mjs` passed over verified TLS.
- **Frontend half DONE:** the rendered cards, filters/counts agreement, and category
  loading/empty/error→Retry states were user-verified in Safari; frontend
  build/lint/tests pass (17/17). A dev-DB value-change proof was already recorded under
  Feature 1's F1 (the mechanism is unchanged); not re-run for every item here.

- [x] **Task V2 — Secret-leak & read-only reconfirmation**
Bundle/source scan clean; runtime role write still rejected (reuse Feature 1 probes;
re-run only parts affected by new rows/columns).
- **Secret-leak DONE:** fresh-build scan of `src/` + `dist/` is CLEAN (no connection
  string, `DATABASE_URL`, Supabase host, service_role/anon JWT, PEM key, `DB_CA_CERT`,
  or `wana_menu_app`); frontend holds only the relative `/api` URL. See
  `server/VERIFICATION.md` → "Frontend secret-leak scan".
- **Read-only DONE:** `verify_d1_connection.mjs` confirmed the login **identity**
  (`current_user = wana_menu_app`); the **read-only** property is established by the
  prior C2 privilege/write-rejection probes (anon + runtime write denied, ledger
  denied) on the 0001–0007 schema.

---

## Dependency summary
```
C0 (remaining base prices) ─> B2 ─> B6
B1 ─┐
B1b ┼─> B1a ─> B6
    └─> B2 ─> B6
B1 ─> B3 ; B1b ─> B3 ─> B3m ─> B4
shared contract ─> F1, F2 ; F2 ─> F3 ─> F4 ; F1 ─> F4 ; (F1,F3) ─> F5
(B4 + F4) ─> V1 ; (B*, F*) ─> V2
```
Backend (B/*) and frontend (F/*) proceed in parallel once the shared contract
(design §3b, incl. the double-meat fields) is agreed; the only cross-track file is
`src/data/menu.js`, owned by Track F.

## Out of scope (do not build here)
Other categories; cart/checkout/pricing/orders/payments/loyalty/accounts/auth; Clover/
kitchen printer; admin editing; modifier archival; any runtime write path; order-time
enforcement of the exactly-one / double-meat rules (display-only this milestone, like
Feature 1); and any modifier/selection rule beyond the restaurant-confirmed set.
