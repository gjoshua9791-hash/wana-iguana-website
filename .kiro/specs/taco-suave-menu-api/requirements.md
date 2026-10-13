# Requirements — Feature 1: Display Taco Suave from a Database-Backed API

## Status
Approved for implementation task planning. Menu prices are current and
restaurant-verified.

## Summary
Display a single menu item — **Taco Suave** — with its base price and a required
"Choose one" protein selection (steak or chicken). The item, its default variant and
price, its modifier group, the per-variant selection rules, and the protein choices
must be retrieved from **PostgreSQL** (hosted in a Supabase development project)
through a new **Node.js + Express + TypeScript** backend API. The existing
**React + Vite** frontend is preserved and calls this API to render the item.

A hard-coded server response does **not** satisfy this feature. The data must
come from database rows.

## Decisions locked for this feature
- Frontend stays React + Vite (no rewrite).
- New backend: Node.js, Express, TypeScript.
- Database: PostgreSQL via a Supabase development project.
- Prices stored as **integer cents** (e.g. `525` = $5.25).
- Taco Suave's base price is **$5.25, stored as `525` cents** — current and
  restaurant-verified.
- **A valid Taco Suave requires exactly one protein.** The business rule is
  `min_select = 1` and `max_select = 1`, and these rules live on the
  **variant-to-group link** (how this variant uses the group), not on the group
  itself. Protein is **not** optional.
- **Business rule vs. temporary UI state are separate concerns.** The catalog
  expresses the real rule (exactly one). React merely starts its temporary
  `selectedOptionId` at `null` (nothing visually pre-selected). The group is
  labeled **"Choose one."**
- This is a **display-only** feature. It has **no submission action**, so there is
  nothing to block — the exactly-one rule is enforced later by the cart/order
  feature. Deferring enforcement does **not** make protein optional.
- Protein selection starts empty; the user may select at most one at a time, and
  choosing the other **replaces** the selection (single-select radio behavior).
- Text IDs are **immutable** and distinct from editable display names.
- Infrastructure for this feature: **one shared Supabase development project** and
  **version-controlled SQL migrations** (schema defined by `.sql` files in the repo).
- The intended ordering integration is **Clover Station Duo with the existing kitchen
  ticket printer**. No Clover calls are part of this feature; integration is
  investigated separately and early.

## Terms (beginner-friendly)
- **API** — a set of web addresses (URLs) the frontend calls over HTTP to get data.
- **Endpoint / route** — one specific URL the API answers, e.g. `GET /api/menu/items/taco-suave`.
- **PostgreSQL** — the relational database that stores the menu data in tables.
- **Supabase** — a hosted service that gives us a managed PostgreSQL database for development.
- **Variant** — a specific sellable version of an item; it carries the price. One
  variant per item is marked the **default** so the display is deterministic.
- **Modifier group** — a set of choices (here: "Protein").
- **Modifier option** — one choice inside a group (here: "Steak", "Chicken").
- **Selection rules** (`min_select`, `max_select`) — how many options a customer must
  and may pick. They live on the **variant↔group link** because they describe how a
  particular variant uses that group.
- **Cents (integer)** — price stored as a whole number of cents to avoid rounding errors.
- **Price delta** — an option's price change relative to the base price (0 = no change).

## In scope
- One item (Taco Suave) served from the database via the API.
- A deterministic single **default variant** carrying the base price.
- Frontend display of name, base price, and the required single-choice protein group.
- Loading, error + retry, and item-not-found states.

## Out of scope (future features)
- Cart, checkout, pricing math, order submission.
- Clover Station Duo / kitchen-printer integration.
- Other menu items, categories, authentication, admin editing.
- Customer accounts, payment, loyalty.
- Submission-time enforcement of the exactly-one protein rule (belongs to cart/order).

## User story
As a customer, I want to see Taco Suave with its price and pick steak or chicken,
so that I can later order it correctly.

## Acceptance criteria
Written as testable "when → then" statements.

- **AC1 — Data source (database-backed).** The item name, the default variant's base
  price (in cents), the protein modifier group, the per-variant selection rules, and
  the two protein choices are retrieved from PostgreSQL at request time. A
  static/hard-coded server response does **not** satisfy this criterion.

- **AC2 — API route.** `GET /api/menu/items/taco-suave` returns the item as JSON
  with stable, immutable string IDs for the item, the default variant, the modifier
  group, and each option; `basePriceCents` as an integer; `priceDeltaCents` per
  option; and the per-variant selection rules (`minSelect`, `maxSelect`).

- **AC3 — Exactly-one business rule.** The protein group as used by this variant is
  returned with `minSelect = 1` and `maxSelect = 1`. Protein is required, not optional.

- **AC4 — Deterministic variant.** The response reflects exactly one variant — the
  item's **active default variant** — and never merges fields from different variants.

- **AC5 — Successful display.** When the API call succeeds, the frontend shows the
  name "Taco Suave" and the base price (formatted from `basePriceCents`, e.g. `$5.25`).

- **AC6 — Loading state.** While the request is in progress, a visible loading
  indicator is shown and no stale or empty item is displayed.

- **AC7 — Error state + retry.** If the request fails (network error or non-success
  HTTP status other than 404), a friendly error message and a **Retry** action are
  shown; retrying re-requests the data.

- **AC8 — Item-not-found.** If the API responds 404 (item missing, or an active item
  has no active default variant), the frontend shows a clear "item unavailable"
  message rather than a generic error or a crash.

- **AC9 — Group label.** The protein group is labeled **"Choose one."**

- **AC10 — UI starts empty.** No protein is visually pre-selected; React's
  `selectedOptionId` starts at `null`. This is temporary UI state, not a statement
  that protein is optional.

- **AC11 — At most one at a time, replace on change.** The user can select steak or
  chicken; selecting one while the other is selected **replaces** it (single-select
  radios).

- **AC12 — Selection feedback.** The currently selected protein is visibly indicated.

- **AC13 — No premature blocking.** Because this feature has no submission action,
  it does not block the user for having no protein selected. The exactly-one rule is
  enforced later by the cart/order feature; it remains a real rule, not an optional one.

- **AC14 — Prices as integer cents.** Prices and price deltas are stored and
  transmitted as integer cents; any dollar formatting happens only for display.

- **AC15 — Credentials stay on the backend.** Database credentials live only on the
  server. The frontend never receives or holds any database connection string,
  Supabase service key, or SQL.

- **AC16 — Single display, in place.** Taco Suave is rendered exactly once, by
  replacing its existing row in the "Original Tacos" list (Option B). No separate
  customer-facing "live from our menu service" section is added.

- **AC17 — Frontend preserved.** The existing React/Vite app still builds and runs;
  all other static menu items render unchanged.

## Open questions for the team
_None open for this feature. Prices are verified, the ordering integration target is
confirmed (Clover Station Duo + kitchen printer, out of scope here), and the dev
infrastructure is set (one shared Supabase project + version-controlled migrations)._
