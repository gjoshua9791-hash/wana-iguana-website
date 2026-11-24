# Requirements — Feature 3: Database-back the Burritos category

## Status
**Draft for team review.** Builds on the completed Feature 1 (Taco Suave) and
Feature 2 (Original Tacos, `.kiro/specs/original-tacos-catalog/`). Reuses the existing
category API, five-table catalog schema, read-only verified-TLS access, and the
in-place React menu rendering. Extends them to the **Burritos** category.

> **Base prices and all protein / double-protein / wet-upgrade rules below are now
> RESTAURANT-CONFIRMED** (see [§ Confirmed rules](#confirmed-rules)). Taco rules still
> do NOT auto-carry: burritos have their own confirmed options and surcharges (the
> numbers differ from the tacos, and burritos add per-option double-protein pricing
> that the taco model does not express). Only confirmed data is encoded.

## Summary
Serve the **Burritos** category from PostgreSQL through the **existing** category
endpoint (`GET /api/menu/categories/:categoryId`, called with `burritos`) and render
it in place with the existing reusable menu card. The backend route/query/mapper are
already generic and already support **multiple modifier groups per item**; the main
new backend work is a seed migration. The main new frontend work is **generalizing the
card to render more than one modifier group** — today it renders only the first group
and hardcodes a taco-specific "Double meat" control.

A hard-coded server response does not satisfy this feature; data must come from
database rows (same rule as Features 1–2).

## The Burritos items (confirmed base prices, integer cents)
Source item set: `src/data/menu.js`, category **"Burritos"**, note **"Served with
chips"**. Base prices are **restaurant-confirmed**.

| # | Item id                 | Name                | Base cents | Protein model |
|---|-------------------------|---------------------|------------|---------------|
| 1 | `fajita-burrito`        | Fajita Burrito      | 1549 | required choose-one (5 options) |
| 2 | `super-burrito`         | Super Burrito       | 1349 | required choose-one (5 options) · popular |
| 3 | `burrito-grande`        | Burrito Grande      | 1349 | required choose-one (5 options) · popular |
| 4 | `bravo-burrito`         | Bravo Burrito       | 1349 | required choose-one (5 options) |
| 5 | `burrito-del-mar`       | Burrito Del Mar     | 1599 | seafood FIXED (shrimp) — no choice · popular |
| 6 | `grilled-fish-burrito`  | Grilled Fish Burrito| 1599 | seafood FIXED (fish) — no choice |
| 7 | `classic-burrito`       | Classic Burrito     | 929  | OPTIONAL added protein (per-option price) |
| — | **Wet Burrito Add On**  | (not an item)       | —    | becomes the **optional wet upgrade** modifier (+429) on all seven |

Item ids are lowercase slugs (Feature 1/2 convention). Each item gets one active
default variant `"<id>-base"` carrying `base_price_cents`. Display order = above.

**`Monster Diabla` is explicitly excluded from this milestone** (it already comes wet
by default — a future concern, not modeled here).

## Confirmed rules
All amounts are integer cents. Three distinct protein shapes across the seven burritos,
plus a wet upgrade shared by all seven. Double portion means an extra portion of the
**same** selected protein — never mixing proteins.

### A. Fajita / Super / Grande / Bravo — required protein + optional double
- **Required, exactly-one protein** (`minSelect = 1, maxSelect = 1`): steak, chicken,
  shredded beef, shredded chicken, grilled veggies. All five have **$0 price delta**.
- **Optional double meat: +299** for the four **meat** choices (steak, chicken,
  shredded beef, shredded chicken). **Grilled veggies are ineligible** for double.
- Double = an extra portion of the selected protein, not mixing proteins.

### B. Burrito Del Mar (shrimp) / Grilled Fish Burrito (fish) — fixed seafood
- The included seafood is **part of the base price**; Del Mar is **shrimp-only**,
  Grilled Fish is **fish-only**. **No seafood substitution** between them.
- **Do NOT present a redundant required choice** for the fixed included seafood (there
  is nothing to choose). Modeled with **no required protein group**.
- **Optional extra portion of that same seafood: +349** (a single optional choice).

### C. Classic Burrito — optional added protein, per-option price
- Base is rice, beans, and cheese; **added protein is optional** (`minSelect = 0`),
  **at most one** (`maxSelect = 1`), and **removable** (a "None" state).
- Added-protein price **depends on the option**:
  - grilled veggies: **+250**
  - steak / chicken / shredded beef / shredded chicken: **+299** each
  - grilled fish / grilled shrimp: **+349** each
- **Double portion** (optional, after a protein is chosen): meats **+299** more;
  seafood **+349** more. **No double for veggies or for "no protein".**
- At most one protein; no mixing proteins.

### D. Wet upgrade — optional, all seven
- **Optional +429** for all seven burritos above (`minSelect = 0, maxSelect = 1`,
  single option).
- **Independent** of protein and double-protein selections (adds 429 on top of any
  combination).
- Modeled as an optional modifier; it **replaces** the standalone "Wet Burrito Add On"
  row when this feature is implemented.

### Classic pricing examples (must hold exactly; integer cents)
| Selection | Total |
|-----------|-------|
| No additions | 929 |
| Veggies | 1179 (929 + 250) |
| Meat | 1228 (929 + 299) |
| Meat, doubled | 1527 (929 + 299 + 299) |
| Seafood | 1278 (929 + 349) |
| Seafood, doubled | 1627 (929 + 349 + 349) |
| Wet upgrade | **+429 independently** on any of the above totals |

> **Customer-facing labels:** use "Double meat" for meat extra portions and a seafood
> wording (e.g. "Double seafood" / "Extra shrimp" / "Extra fish") for seafood extra
> portions — the label must suit meat vs seafood, driven by data, not hard-coded per
> item in the component.

### The double-portion price is PER OPTION, not per group (modeling consequence)
Original Tacos' `doubleMeat` is a **single group-level** surcharge. Classic breaks that:
within one optional-protein group, doubling costs **+299 for meats** but **+349 for
seafood**, and **veggies/none can't double at all**. A single group-level amount cannot
express this. The smallest additive fix (detailed in `design.md` §1a) is a **per-option
double-portion price** supplied by the API; the frontend derives eligibility and charge
from that data and never hard-codes restaurant prices.

## Decisions locked (inherited from Features 1–2, reaffirmed)
- Frontend React + Vite; backend Node + Express + TypeScript; PostgreSQL via Supabase.
- Prices are **integer cents**; dollar formatting is display-only.
- Text IDs are **immutable**, distinct from editable display names.
- **Reuse, not rebuild:** the category endpoint, query, mapper, access control, and
  verified TLS are reused unchanged. Runtime DB access stays **read-only**
  (`menu_backend`, SELECT-only); any new table/column/view gets the same SELECT-only
  grant + RLS read policy; no write path is added.
- Additive migrations only; applied migrations (`0001`–`0007`) are **never edited**;
  the migration runner's fixed list is extended for new files.
- Category note, images, and popularity remain **frontend presentation metadata**
  (not in the API, not seeded), as in Feature 2.
- A successful category response is **authoritative**; items omitted by the API are
  not shown from static fallback.

## New decisions for this feature (confirmed / resolved)
- **Multiple modifier groups** are first-class: the card renders every group in
  `modifierGroups` in order, not just the first. A burrito can have 0–2 groups
  (protein/optional-protein and/or wet upgrade).
- **Per-option double-portion price** is the smallest additive extension to the
  existing group-level `doubleMeat` model (design §1a): each option may carry its own
  extra-portion price + eligibility, supplied by the API. This is required for Classic
  (+299 meats vs +349 seafood vs ineligible veggies) and is used uniformly for the
  other burritos too. No restaurant price is hard-coded in frontend components.
- **Wet upgrade** is a generic optional modifier group (`minSelect = 0, maxSelect = 1`,
  one `wet` option at **+429**), linked to all seven burritos; independent of protein.
- **Configured price** = base + selected protein option delta + eligible/checked
  double-portion surcharge (per option) + wet surcharge (if selected). Integer cents.
- The frontend category hook and endpoint are **parameterized by category slug** so
  one hook serves tacos and burritos.

## In scope
- Seed the seven confirmed burritos + default variants (confirmed base prices).
- Model three protein shapes: required choose-one with per-option double (A); no
  required choice + optional same-seafood double portion (B); optional removable added
  protein with per-option add + per-option double (C).
- Model the reusable optional **wet upgrade** (+429) linked to all seven.
- Serve Burritos via the existing category endpoint; render in place via the reusable
  card, generalized to multiple groups and per-option double-portion pricing.
- Preserve search/filter/count behavior and loading/error+Retry/empty states.

## Out of scope (unchanged from Features 1–2)
- Other categories — still static (incl. **Monster Diabla**, which comes wet by
  default and is explicitly excluded from this milestone).
- Cart, checkout, order submission, payments, loyalty, accounts, auth.
- Clover / kitchen-printer; admin editing; modifier archival; any runtime write path.
- Migrating Original Tacos' `doubleMeat` to the new per-option shape (the taco API
  fields and behavior are preserved as-is; a later cleanup, not this feature).

## Remaining genuine ambiguities (flag, do NOT invent)
The confirmed rules are complete for pricing/selection. These implementation-detail
choices are not restaurant rules and are proposed in `design.md` for team sign-off, not
invented facts:
- **Option/group ids and exact customer-facing wording** (e.g. the seafood
  double-portion label per item). Design proposes ids; the restaurant has naming
  preferences only if it says so.
- **Whether protein options are shared rows across groups** (e.g. does Classic's
  optional-protein group reuse the same `steak` option row as group A, or use distinct
  ids because its deltas differ). This is a data-modeling choice (design §1a/§2), not a
  pricing rule; the confirmed *prices* are unambiguous either way.
No base price, option, delta, selection limit, or eligibility rule remains unconfirmed.
The **"Served with chips" note** and **popularity** flags remain frontend presentation
metadata (not seeded, not in the API), consistent with Feature 2.

## User story
As a customer, I want to see each burrito with its current price and any available
choices (protein and/or a wet upgrade) sourced from the live menu database, so the
menu matches what the restaurant has configured.

## Acceptance criteria (testable "when → then")
- **AC1 — Category is database-backed.** Burrito names, default-variant base prices
  (integer cents), and confirmed modifier data are retrieved from PostgreSQL at request
  time via the existing category endpoint. Hard-coded server responses do not satisfy.
- **AC2 — Reuse the category endpoint.** `GET /api/menu/categories/burritos` returns
  the burritos in display order using the SAME per-item JSON shape as other categories
  (incl. `modifierGroups[]`); no new route is required.
- **AC3 — Multiple modifier groups rendered.** The card renders **every** group in
  `modifierGroups` in order (today's card renders only the first; it must be
  generalized). A burrito may show a protein/optional-protein group and the wet-upgrade
  group together, one of them, or none.
- **AC4 — Required protein with per-option double (A: Fajita/Super/Grande/Bravo).**
  A required choose-one group (`minSelect = 1, maxSelect = 1`), initially unselected,
  with five $0 options (steak, chicken, shredded beef, shredded chicken, grilled
  veggies). The four meats offer an optional **+299 double**; grilled veggies does not.
- **AC5 — Fixed seafood with optional same-seafood double (B: Del Mar/Grilled Fish).**
  No required protein choice (seafood is fixed in the base; **no redundant choice**).
  A single optional **+349 extra portion of that same seafood**; no seafood
  substitution between items.
- **AC6 — Optional, removable, per-option added protein (C: Classic).** Base 929 with
  an **optional** added protein (`minSelect = 0, maxSelect = 1`, **removable** to a
  "None" state): grilled veggies **+250**; steak/chicken/shredded beef/shredded chicken
  **+299** each; grilled fish/grilled shrimp **+349** each. After a **meat**, optional
  double **+299**; after **seafood**, optional double **+349**; **no double** for
  veggies or no protein.
- **AC7 — Double portion is same-protein, per-option, and derived from API data.**
  Double adds another portion of the **selected** protein (never mixing). Eligibility
  and the surcharge are read from the API per option (meats/seafood eligible with their
  own amounts; veggies/none ineligible). No restaurant price is hard-coded in the
  frontend.
- **AC7a — Double clears on protein change/removal.** Changing the selected protein, or
  removing it, **clears** any double-portion selection and its surcharge; re-enabling
  double requires a fresh opt-in for the new protein (no automatic carry-over).
- **AC8 — Optional wet upgrade, independent, all seven.** Each of the seven burritos
  offers an optional wet upgrade (`minSelect = 0, maxSelect = 1`, **+429**), off by
  default, toggleable, **independent** of protein and double-protein (adds 429 on top
  of any combination). "Wet Burrito Add On" does NOT appear as its own menu item — it
  is only this modifier, replacing the standalone row.
- **AC8a — Classic pricing examples hold exactly.** No additions 929; veggies 1179;
  meat 1228; meat doubled 1527; seafood 1278; seafood doubled 1627; **wet adds 429
  independently** to any of these.
- **AC8b — Meat vs seafood labels.** Double-portion controls use a label suited to the
  protein kind (meat wording vs seafood wording), driven by API data — not hard-coded
  per item in the component.
- **AC9price — Configured price (integer cents).** displayed configured price = base +
  selected protein option delta + eligible/checked double-portion surcharge (per
  option) + wet surcharge (if selected). **Max-price filtering uses the API base
  price** (not the configured total), as in Feature 2.
- **AC9 — Authoritative, no static fallback.** A 200 response is authoritative; a
  burrito omitted by the API is not rendered from static data; an empty category is a
  valid 200 `items: []`.
- **AC10 — States + filters preserved.** Loading / error+Retry / empty category states
  render in place (visible regardless of search/price/popular filters, as fixed in
  Feature 2); search/category/max-price/popular filters and counts keep working and
  agree with displayed values.
- **AC11 — Additive migrations, read-only runtime.** New schema/seed is new migration
  files applied after `0007`, tracked by the ledger; `0001`–`0007` unedited; the runner
  list is extended. Runtime role gains only SELECT on anything new.
- **AC12 — Only confirmed data encoded; no inference.** Only the confirmed base
  prices, options, deltas, double-portion amounts/eligibility, and selection limits are
  seeded. Nothing is inferred from static copy; no taco surcharge/substitution rule is
  applied to burritos.
- **AC13 — Original Tacos & other categories unaffected (regression).** The Original
  Tacos API fields (`doubleMeat`/`doubleMeatAvailable`) and behavior are preserved
  exactly; its tests still pass. All other categories render as before; the app builds,
  lints, and passes existing tests.
- **AC14 — Independent category states.** Burritos and Original Tacos are independent
  API-backed categories: each has its own loading / error+Retry / empty state, and one
  category's error or retry does not affect the other (or any static category).

## Open questions for the team (implementation sign-off, not restaurant rules)
Pricing/selection is fully confirmed; these are modeling/wording choices proposed in
`design.md`:
- Option/group **ids** and the exact seafood-double **label wording**.
- Whether Classic's optional-protein options are **distinct rows** from group A's
  (likely yes, since Classic's base-add deltas differ: +250/+299/+349 vs A's $0), or
  shared rows. Confirmed *prices* hold under either choice.
- No burrito-specific required extras (e.g. tortilla type) were confirmed, so none are
  modeled this milestone.
