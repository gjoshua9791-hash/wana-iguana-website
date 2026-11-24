# Requirements — Feature 2: Database-back the whole Original Tacos category

## Status
**Draft for team review.** Builds directly on the completed Feature 1
(`.kiro/specs/taco-suave-menu-api/`), which already serves **Taco Suave** from
PostgreSQL through `GET /api/menu/items/:itemId` and renders it in place in the
React/Vite frontend. This feature extends that foundation to the **four remaining
Original Tacos items** and adds a **category (list) endpoint** plus a **reusable
frontend menu component**.

> **Prices and menu rules below are copied from the current static `src/data/menu.js`
> and are NOT yet restaurant-confirmed for this feature.** See
> [§ Items requiring restaurant confirmation](#items-requiring-restaurant-confirmation).
> No modifier charges or selection rules are invented here (see that section).

## Summary
Make the entire **Original Tacos** category database-backed, reusing Feature 1's
five-table catalog, read-only Express API, verified-TLS access, and in-place React
display. The category has five items; Taco Suave is already done. This feature:

1. Seeds the other four Original Tacos items (and their variants) via a **new,
   additive** migration that does not alter already-applied migrations.
2. Adds a **category list endpoint** returning the Original Tacos items in display
   order, suitable for a reusable frontend component.
3. Introduces a **reusable menu-item component** (generalized from `TacoSuaveCard`)
   that renders any catalog item, and swaps the four static Original Tacos rows for
   API-backed rendering — **without changing the existing single-item endpoint or
   Taco Suave's current behavior**.

A hard-coded server response does not satisfy this feature; data must come from
database rows (same rule as Feature 1).

## The five Original Tacos items (from current static menu)
Source: `src/data/menu.js`, category **"Original Tacos"**, note **"Served with
chips"**. Order below is the current on-screen order and is the intended display
order.

| # | Proposed item id   | Name         | Static price | Static description (current site copy) |
|---|--------------------|--------------|--------------|-----------------------------------------|
| 1 | `taco-suave`       | Taco Suave   | $5.25        | (already database-backed — Feature 1)   |
| 2 | `taco-duro`        | Taco Duro    | $5.25        | Crispy shell corn tortilla with choice of shredded beef or shredded chicken with cheese, lettuce, and our special tomato sauce. (Meat substitutions not allowed) |
| 3 | `taco-bravo`       | Taco Bravo   | $5.25        | Choice of steak or chicken, beans, avocado, and our spicy bravo salsa. |
| 4 | `taco-del-mar`     | Taco Del Mar | $6.75        | Choice of grilled fish (tilapia) or grilled shrimp with cabbage, pico de gallo, and our special white sauce. |
| 5 | `taco-supreme`     | Taco Supreme | $8.50        | Large crispy flour tortilla with choice of shredded beef or grilled chicken with lettuce, cheese, sour cream, and guacamole. |

Proposed ids are lowercase slugs matching the Feature 1 convention (`taco-suave`,
`taco-suave-base`). Each item gets one active default variant `"<id>-base"` carrying
`base_price_cents`.

## Decisions locked (inherited from Feature 1, reaffirmed)
- Frontend stays React + Vite; backend stays Node + Express + TypeScript; database is
  PostgreSQL (shared Supabase dev project).
- Prices are **integer cents** (`$5.25` → `525`). Dollar formatting is display-only.
- Text IDs are **immutable** and distinct from editable display names.
- **Schema reuse, no structural change expected.** The existing five tables already
  model many items/variants/groups/options. This feature adds **data** (a seed
  migration) and, if a list endpoint needs a category grouping the schema does not yet
  express, a **minimal, additive** schema change (see design — an optional `category`
  column on `menu_item`, decided there). Already-applied migrations (`0001`–`0004`)
  are **never edited**; new work is new files (`0005`+).
- Runtime database access stays **read-only** (`menu_backend` role, SELECT-only, RLS
  read policies). Any new table/column/view gets the same SELECT-only grant + read
  policy; no write path is added.
- Credentials stay server-side; the frontend only calls relative `/api` URLs.

## New decisions for this feature (resolved for review)
- **Category endpoint:** `GET /api/menu/categories/:categoryId` (called with
  `original-tacos`) returns a single ordered list object; the **exact JSON contract and
  its loading/error/empty/omitted-item behavior are fixed in `design.md` §3b.** A
  successful 200 is **authoritative** for which items are available; an item omitted
  from a 200 response is treated as unavailable and is never resurrected from static
  data.
- **Per-item payload** matches the single-item route's 200 body field-for-field so one
  component renders either source.
- **Single-item route:** its **contract and behavior are preserved** (200 shape / 404
  `item_not_found` / 500 `internal_error` / default-variant semantics). We do not
  require byte-for-byte identical bytes, only the documented contract and an equivalent
  `taco-suave` response.
- **Reusable component:** generalize `TacoSuaveCard` into `MenuItemCard`;
  `TacoSuaveCard` becomes a thin wrapper (or is replaced) so **Taco Suave's existing
  behavior is unchanged**.
- **Presentation metadata is frontend-only this milestone:** the category **note**
  ("Served with chips"), **images**, and **popularity** stay in `src/data/menu.js` and
  are **not** part of the API contract and **not** seeded into the DB.
- **Every Original Tacos item has a stable `id`** in `menu.js`, so overlay/swap/
  exclusion reconciliation keys on the immutable id + category slug, **never on the
  display name**.
- **Deterministic order:** the list orders by `sort_order` then `id` (stable-ID
  tie-breaker).
- **Migration runner:** its fixed, hard-coded `MIGRATIONS` list must be extended for
  the new files (see `design.md` §4a) — a required backend task, not optional.

## In scope
- Seed the four remaining Original Tacos items + default variants (new migration).
- A read-only category list endpoint for Original Tacos.
- A reusable React component rendering catalog items, with the four states
  (loading / error+Retry / not-found / success) already proven in Feature 1.
- Swapping the four static Original Tacos rows for API-backed rendering, in place,
  preserving search / category / price / popular filtering and result counts.
- New additive migration(s) + SELECT-only access for anything new; verification.

## Out of scope (unchanged from Feature 1)
- Other categories (Burritos, Favorites, etc.) — still static.
- Cart, checkout, pricing math, order submission, payments, loyalty, accounts, auth.
- Clover Station Duo / kitchen-printer integration.
- Admin editing of the catalog; modifier group/option archival.
- Any write path for the runtime role.
- Other categories, cart/checkout/ordering, payments, Clover, accounts/auth, admin
  editing — all still out of scope.

> **Protein and double-meat rules are now restaurant-confirmed** (see the next
> section). Every Original Tacos item ships **with** its required protein group;
> shipping these tacos with empty modifier groups is **no longer** a proposed release
> path. Base prices other than Taco Del Mar's remain pending (see below).

## Restaurant-confirmed menu rules (authoritative)
These replace the earlier pending protein questions. They are confirmed catalog data
and are encoded (not inferred). All prices are integer cents.

### Required protein — every taco
- Exactly one protein per taco: **`minSelect = 1, maxSelect = 1`** on the
  variant↔protein-group link. Protein is required.
- The UI starts with **no protein pre-selected** so the customer chooses explicitly.
- Customers **cannot mix two different proteins** (single-select, enforced by the
  one-group/one-choice rule; see §double-meat for why this also blocks mixed meat).

### Protein options and base-protein deltas (all $0)
| Item | Protein options | Each option `priceDeltaCents` |
|------|-----------------|-------------------------------|
| Taco Suave    | steak, chicken, shredded beef, shredded chicken, grilled veggies | 0 |
| Taco Bravo    | steak, chicken, shredded beef, shredded chicken, grilled veggies | 0 |
| Taco Supreme  | steak, chicken, shredded beef, shredded chicken, grilled veggies | 0 |
| Taco Duro     | shredded chicken, shredded beef **only** (no substitutions, no double-meat) | 0 |
| Taco Del Mar  | grilled fish, grilled shrimp | 0 |

- **Taco Del Mar:** both options carry `priceDeltaCents = 0` on the confirmed base
  price **675 cents**; no extra-seafood option in this milestone.
- **Taco Duro:** only the two shredded meats; no other substitutions and no
  double-meat (see below).

### Optional double meat — an extra portion of the SAME selected meat
Double meat is **not** a second protein choice. It adds another portion of the
**already-selected** meat. It never allows mixing two proteins.

| Item | Double-meat surcharge |
|------|-----------------------|
| Taco Suave   | +150 cents |
| Taco Bravo   | +150 cents |
| Taco Supreme | +299 cents |
| Taco Duro    | not offered |
| Taco Del Mar | not offered |

Rules:
- Double meat is **unavailable when "grilled veggies" is selected** (veggies is not a
  meat). It is available only for the meat options.
- Switching the protein **from a meat to grilled veggies must clear any double-meat
  selection and remove its +cents surcharge.**
- Double meat applies to whichever meat is selected; it is the *same* meat doubled,
  so it cannot introduce a second, different protein.

> **Modeling note (why this is not two independent groups):** the double-meat choice
> depends on the protein selection (same meat; disabled for veggies). Two independent
> modifier groups cannot express that dependency, and we are explicitly **not**
> building a generic rules engine. The smallest explicit representation is given in
> `design.md` §1a/§3b: double meat is modeled as an attribute **tied to the protein
> option and the item's protein-group link**, not as a free-standing group.

## Base prices — ALL FIVE CONFIRMED
Restaurant-confirmed as current (integer cents):

| Item | Confirmed base price |
|------|----------------------|
| Taco Suave   | 525 cents ($5.25) — already seeded in Feature 1 |
| Taco Duro    | 525 cents ($5.25) |
| Taco Bravo   | 525 cents ($5.25) |
| Taco Supreme | 850 cents ($8.50) |
| Taco Del Mar | 675 cents ($6.75) |

All five default variants are now seedable. No base price remains pending.

### Resolved for THIS milestone (frontend presentation metadata — not DB, not API)
These are **not** pending restaurant confirmation to proceed; they are fixed as
frontend-only for this feature and may be revisited later:
- **Category note** ("Served with chips") — stays in `menu.js`; not in the API payload.
- **Images** — stay in `menu.js`; image paths are frontend presentation metadata.
- **Popularity** (`popular` on Taco Suave, Taco Duro) — stays a frontend editorial
  flag in `menu.js`; **not** seeded into the DB and **not** in the API contract for
  this feature. (Making "popular" DB-driven is a possible future change, out of scope
  here.)

## User story
As a customer, I want to see every Original Tacos item with its current price (and,
where confirmed, its choices) sourced from the live menu database, so the menu I see
matches what the restaurant has configured.

## Acceptance criteria (testable "when → then")

- **AC1 — Category is database-backed.** The five Original Tacos items' names,
  default-variant base prices (integer cents), and (where confirmed) modifier data are
  retrieved from PostgreSQL at request time. Hard-coded server responses do not
  satisfy this.
- **AC2 — Category list endpoint (authoritative).** A read-only endpoint returns the
  Original Tacos items ordered by `sort_order` then `id`, each with stable immutable
  ids, `basePriceCents` (integer), and the same per-item JSON shape as the single-item
  route (exact contract in `design.md` §3b). A 200 response is **authoritative** for
  available items: an item with no active default variant is **omitted** (an empty
  category is a valid 200 `items: []`, not a 404), and an omitted item must **not** be
  rendered from static fallback data. 500 `internal_error` on a thrown DB error.
- **AC3 — Single-item endpoint contract/behavior preserved.** `GET
  /api/menu/items/:itemId` keeps its Feature 1 **contract and observable behavior**
  (200 shape / 404 `item_not_found` / 500 `internal_error` / default-variant
  semantics), including an equivalent `taco-suave` response. Byte-for-byte identical
  output is **not** required; the documented contract and behavior are.
- **AC4 — Deterministic default variant.** Each listed item reflects only its active
  default variant; fields from other variants are never merged (same rule as F1).
- **AC5 — Reusable component.** A single React component renders any Original Tacos
  item from the API, with loading / error+Retry / not-found / success states. Taco
  Suave renders through this component with **no change to its existing behavior**.
- **AC6 — In-place, no double display.** Each Original Tacos item appears exactly once,
  in its existing slot and order; all other categories render unchanged.
- **AC7 — Filtering/counts preserved.** Search, category, max-price, and popular-only
  filters and the result counts keep working and agree with displayed values, using
  the API values (reusing the Feature 1 reconcile-before-filter approach).
- **AC8 — Prices as integer cents.** Stored and transmitted as integer cents; dollar
  formatting is display-only.
- **AC9 — Credentials stay on the backend.** Runtime DB access is read-only; the
  frontend never receives a connection string, key, or SQL.
- **AC10 — Additive migrations only, runner updated.** New schema/seed is delivered as
  new migration files applied after `0004`, tracked by the existing ledger; `0001`–
  `0004` are not edited. The migration runner's fixed `MIGRATIONS` list is extended for
  the new files (required — see `design.md` §4a). Runtime role gains only SELECT on
  anything new.
- **AC11 — Only confirmed data is encoded.** Prices, options, deltas, and selection
  rules are encoded only from the restaurant-confirmed rules above; nothing is
  inferred. With protein rules now confirmed, every Original Tacos item ships **with**
  its required protein group — shipping empty `modifierGroups` for these tacos is no
  longer a release path. An item's default variant is still seeded only once its base
  price is confirmed (Del Mar confirmed; the other three pending).
- **AC12 — Required exactly-one protein.** Each item's protein group is returned with
  `minSelect = 1, maxSelect = 1`; the UI starts with nothing selected and allows at
  most one protein (no mixing two proteins).
- **AC13 — Confirmed protein options and $0 deltas.** Suave/Bravo/Supreme list steak,
  chicken, shredded beef, shredded chicken, and grilled veggies (all `priceDeltaCents
  0`); Duro lists shredded chicken and shredded beef only (both 0); Del Mar lists
  grilled fish and grilled shrimp (both 0, on base 675).
- **AC14 — Double meat is same-protein and dependent, not a second protein.** Double
  meat adds an extra portion of the already-selected meat with the confirmed surcharge
  (Suave +150, Bravo +150, Supreme +299; Duro and Del Mar: none). It never introduces
  a second, different protein.
- **AC15 — Double meat unavailable for grilled veggies; cleared on switch.** Double
  meat is offered only when a meat protein is selected; selecting "grilled veggies"
  disables it, and switching from a meat to grilled veggies **clears** any double-meat
  selection and removes its surcharge.
- **AC16 — Explicit dependency representation (no independent-groups/rules-engine).**
  The double-meat↔protein dependency is represented explicitly in the contract (see
  `design.md` §1a/§3b): tied to the protein option and the item's protein-group link,
  not as a free-standing modifier group and not via a generic rules engine.
- **AC17 — Stable-ID reconciliation.** Every Original Tacos item has a stable `id` in
  `menu.js`; overlay/swap/exclusion match on the immutable id + category slug, never on
  the display name. Category note, images, and popularity remain frontend presentation
  metadata (not API, not DB) for this milestone.
- **AC18 — Frontend preserved.** The app still builds and runs; the existing
  routing/filter tests pass; Taco Suave and all other categories are unaffected.

## Focused acceptance checks (for the confirmed rules)
Each is a concrete, testable observation on the API and/or UI:
- **FC1 — Exactly-one protein.** For each item, the protein group has `minSelect:1,
  maxSelect:1`; the UI starts unselected; selecting a second protein replaces the
  first (never two selected).
- **FC2 — Same-protein double meat.** With a meat selected, enabling double meat keeps
  the **same** protein id selected (double meat does not add or change the protein);
  there is never a state with two different proteins.
- **FC3 — Each surcharge is correct.** Double meat adds exactly **+150** for Taco
  Suave, **+150** for Taco Bravo, **+299** for Taco Supreme (as integer cents); Taco
  Duro and Taco Del Mar expose **no** double-meat option.
- **FC4 — Veggies clears double meat.** With a meat + double meat selected, switching
  the protein to grilled veggies clears the double-meat selection and removes its
  surcharge; double meat is not selectable while veggies is selected.
- **FC5 — Del Mar seafood $0 on base 675.** Grilled fish and grilled shrimp each add
  `priceDeltaCents 0` on `basePriceCents 675`.

## Open questions for the team (genuinely remaining)
- **Base prices pending:** confirm Taco Duro $5.25, Taco Bravo $5.25, Taco Supreme
  $8.50 (and re-confirm Taco Suave $5.25). Del Mar $6.75 is confirmed. Until a price is
  confirmed, that item's default variant is not seeded.
- **Double-meat display labels/ids:** confirm the customer-facing label (e.g. "Double
  meat") and whether the surcharge text should show per item; option/flag **ids** are
  an implementation choice (design proposes them) unless the restaurant has naming
  preferences.
- Confirm the omitted-item rule: omit unavailable items from the 200 list (current
  design) vs. include them flagged — design chooses **omit**.

_Resolved:_ protein options, required exactly-one rule, $0 base-protein deltas, the
double-meat surcharges and same-meat/veggies-exclusion dependency, and Del Mar's 675
base price. Category endpoint shape, category membership via an additive `category`
column, and note/image/popularity as frontend metadata were resolved earlier.
