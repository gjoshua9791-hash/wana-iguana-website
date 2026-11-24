# Burritos — Frontend Handoff Contract

This is the single source of truth for the Burritos frontend work. The backend
(migrations 0008/0009, query, mapper) is implemented and verified on branch
`feature/burritos-catalog`. The frontend is NOT implemented — it is yours.

Everything here is confirmed against the actual seed data (migration
`0009_seed_burritos.sql`) and the mapper output (`server/src/menu/mapRows.ts`),
and exercised by two automated checks: `server/verify_f3_http.mjs` (route+mapper
shape) and `server/migrations/verify_f3_burritos.sh` (schema+seed on isolated
local DBs). If something here disagrees with the running API, the API wins —
tell the backend owner.

**Scope of this milestone: display + configuration only.** Your job is to render
the Burritos category and let the customer *configure* an item (pick protein,
toggle double portion, toggle wet) and see the computed price update. There is
**no cart, no "Add item"/"Add to order" button, and no checkout** in this
milestone — do not implement them, and do not treat them as a prerequisite for
anything here. "Configured price" means the live total shown on the card as the
customer changes selections; it is a display value, not an order. This mirrors
the Original Tacos milestone, which is also configure-and-display only.

**Golden rules**
1. Never hard-code a price or a surcharge in the frontend. Every amount comes
   from the API, in integer cents.
2. Use the stable `id`s below as keys and selection values, never the display
   `name`. Do not infer any rule from display text.
3. `doublePortion` is the per-option "add a second portion" field for burritos.
   It is additive and independent of the taco fields; see the precedence section.

---

## 1. Endpoint

```
GET /api/menu/categories/burritos        -> 200 { "category": "burritos", "items": [ MenuItem, ... ] }
GET /api/menu/items/:itemId              -> 200 MenuItem      (same item shape)
```

- 200 with `items: []` for an empty/unknown category (NOT a 404).
- An item with no active default variant is OMITTED from `items` (the list stays
  authoritative). This is unchanged from Original Tacos.
- 500 `{ "error": "internal_error" }` on backend failure — show the category
  error state with Retry (see §6). The body never contains SQL, stack, or creds.

Each category loads independently. A failure of `burritos` must not blank out
`original-tacos` or any other category, and vice versa.

---

## 2. Response shape (TypeScript)

```ts
interface MenuItem {
  id: string
  name: string
  description: string | null
  variantId: string
  basePriceCents: number                 // integer cents
  modifierGroups: MenuModifierGroup[]     // may be empty
}

interface MenuModifierGroup {
  id: string
  label: string
  minSelect: number                       // 0 = optional, 1 = required
  maxSelect: number                       // 1 across all current burrito groups
  doubleMeat: { priceDeltaCents: number } | null   // TACO field; ALWAYS null for burritos
  options: MenuOption[]
}

interface MenuOption {
  id: string
  name: string
  priceDeltaCents: number                 // integer cents, added to base when selected
  doubleMeatAvailable: boolean            // TACO field; ALWAYS false for burritos
  doublePortion: { priceDeltaCents: number } | null  // BURRITO field; null = cannot be doubled
}
```

`doublePortion` is EXACTLY `null` OR `{ "priceDeltaCents": <integer> }`. There is
no other shape. `null` means this option cannot be doubled; render no
double-portion control for it. A non-null value is the cents to add for a second
portion of that one option.

---

## 3. Precedence: new `doublePortion` vs legacy `doubleMeat` / `doubleMeatAvailable`

There are two double-portion metadata models in the response. They coexist; both
are always present on every option/group. The decision is **per selected option**,
in this strict order. Evaluate it against the option the customer has selected in
the group:

1. **If the selected `option.doublePortion` is non-null → use it.** Offer one
   "Double this (+`option.doublePortion.priceDeltaCents`)" control. Ignore
   `group.doubleMeat` and `option.doubleMeatAvailable` entirely for this option.
2. **Else, if `group.doubleMeat` is non-null AND the selected
   `option.doubleMeatAvailable === true` → use the legacy taco path.** Offer one
   "Double meat (+`group.doubleMeat.priceDeltaCents`)" control.
3. **Else → no double control** (the selected option cannot be doubled).

**Never charge both.** At most one double surcharge applies to a selected option:
either its own `doublePortion` amount, or the group's `doubleMeat` amount, never
the sum. The legacy `doubleMeat` path is used **only** when `doublePortion` is
null for that option AND `doubleMeatAvailable` is true.

How this lands on the actual seeded data (do not change this behavior):

- **Every burrito option:** `group.doubleMeat` is null and `doubleMeatAvailable`
  is false. Doubleable burrito options carry a non-null `doublePortion` (step 1);
  the rest carry null (step 3). The legacy path never fires for burritos.
- **Every Original Tacos option:** `doublePortion` is null, so step 1 never fires;
  the taco group's `doubleMeat` plus per-option `doubleMeatAvailable` drive the
  control exactly as in Feature 2 (step 2 or 3). Taco rendering is unchanged.

A single generic component implements the three steps above. It reads
`option.doublePortion` first and only falls back to the `group.doubleMeat` /
`option.doubleMeatAvailable` pair when `doublePortion` is null. It never reads
both amounts for one control and never adds them together.

---

## 4. The seven burritos, group/option ids, limits, deltas, eligibility

Base prices (default variant, integer cents): Fajita 1549, Super 1349, Grande
1349, Bravo 1349, Del Mar 1599, Grilled Fish 1599, Classic 929.

Item ids / default variant ids:
`fajita-burrito`/`fajita-burrito-base`, `super-burrito`/`super-burrito-base`,
`burrito-grande`/`burrito-grande-base`, `bravo-burrito`/`bravo-burrito-base`,
`burrito-del-mar`/`burrito-del-mar-base`,
`grilled-fish-burrito`/`grilled-fish-burrito-base`,
`classic-burrito`/`classic-burrito-base`.

### Group `burrito-protein` — shared by Fajita, Super, Grande, Bravo
Purpose: the required choice of what protein goes in the burrito. **Required,
choose exactly one** (`minSelect 1 / maxSelect 1`). `doubleMeat: null`.

| option id | name | priceDeltaCents | doublePortion | notes |
|---|---|---|---|---|
| `burrito-steak` | Steak | 0 | `{299}` | meat, doubleable |
| `burrito-chicken` | Chicken | 0 | `{299}` | meat, doubleable |
| `burrito-shredded-beef` | Shredded Beef | 0 | `{299}` | meat, doubleable |
| `burrito-shredded-chicken` | Shredded Chicken | 0 | `{299}` | meat, doubleable |
| `burrito-grilled-veggies` | Grilled Veggies | 0 | `null` | not doubleable |

### Group `classic-protein` — Classic Burrito only
Purpose: an OPTIONAL, removable added protein on top of the base rice/beans/cheese.
**Optional, choose at most one** (`minSelect 0 / maxSelect 1`). `doubleMeat: null`.
The base-add price differs by protein type, so these are DISTINCT ids from
`burrito-protein` (an option row has one price delta).

| option id | name | priceDeltaCents | doublePortion |
|---|---|---|---|
| `classic-grilled-veggies` | Grilled Veggies | 250 | `null` |
| `classic-steak` | Steak | 299 | `{299}` |
| `classic-chicken` | Chicken | 299 | `{299}` |
| `classic-shredded-beef` | Shredded Beef | 299 | `{299}` |
| `classic-shredded-chicken` | Shredded Chicken | 299 | `{299}` |
| `classic-grilled-fish` | Grilled Fish | 349 | `{349}` |
| `classic-grilled-shrimp` | Grilled Shrimp | 349 | `{349}` |

### Groups `delmar-extra` (Del Mar) and `fish-extra` (Grilled Fish)
Purpose: the burrito's seafood is included in the base price and is NOT a choice,
so there is **no required protein group**. Each offers an OPTIONAL single extra
portion of the same seafood (`minSelect 0 / maxSelect 1`). `doubleMeat: null`.

| group | option id | name | priceDeltaCents | doublePortion |
|---|---|---|---|---|
| `delmar-extra` | `extra-shrimp` | Extra shrimp | 349 | `null` |
| `fish-extra` | `extra-fish` | Extra fish | 349 | `null` |

`doublePortion` is `null` because the option IS the extra portion — there is no
doubling the extra again. You do not select the included seafood anywhere; it is
part of the base price.

### Group `wet-upgrade` — on ALL seven burritos
Purpose: optional "make it wet" (red sauce + melted cheese) upgrade, independent
of protein and of any double-portion choice. **Optional, choose at most one**
(`minSelect 0 / maxSelect 1`). `doubleMeat: null`.

| option id | name | priceDeltaCents | doublePortion |
|---|---|---|---|
| `wet` | Wet (red sauce + melted cheese) | 429 | `null` |

The former static "Wet Burrito Add On" is THIS modifier, not a standalone menu
item. Do not render it as its own card.

Group order within an item is given by the response order (`modifierGroups` is
pre-sorted): protein/extra first, then `wet-upgrade`.

---

## 5. Exact response examples

### 5a. Regular burrito — `burrito-grande` (Group A protein + wet)
```jsonc
{
  "id": "burrito-grande", "name": "Burrito Grande", "description": "...",
  "variantId": "burrito-grande-base", "basePriceCents": 1349,
  "modifierGroups": [
    { "id": "burrito-protein", "label": "Choose one", "minSelect": 1, "maxSelect": 1, "doubleMeat": null,
      "options": [
        { "id": "burrito-steak",            "name": "Steak",            "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "burrito-chicken",          "name": "Chicken",          "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "burrito-shredded-beef",    "name": "Shredded Beef",    "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "burrito-shredded-chicken", "name": "Shredded Chicken", "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "burrito-grilled-veggies",  "name": "Grilled Veggies",  "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": null }
      ] },
    { "id": "wet-upgrade", "label": "Make it wet?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [ { "id": "wet", "name": "Wet (red sauce + melted cheese)", "priceDeltaCents": 429, "doubleMeatAvailable": false, "doublePortion": null } ] }
  ]
}
```

### 5b. Fixed-seafood burrito — `burrito-del-mar` (optional extra portion + wet)
```jsonc
{
  "id": "burrito-del-mar", "name": "Burrito Del Mar", "description": "...",
  "variantId": "burrito-del-mar-base", "basePriceCents": 1599,
  "modifierGroups": [
    { "id": "delmar-extra", "label": "Add an extra portion?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [ { "id": "extra-shrimp", "name": "Extra shrimp", "priceDeltaCents": 349, "doubleMeatAvailable": false, "doublePortion": null } ] },
    { "id": "wet-upgrade", "label": "Make it wet?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [ { "id": "wet", "name": "Wet (red sauce + melted cheese)", "priceDeltaCents": 429, "doubleMeatAvailable": false, "doublePortion": null } ] }
  ]
}
```
(`grilled-fish-burrito` is identical with group `fish-extra`, option `extra-fish`,
base `1599`.)

### 5c. Classic — `classic-burrito` (optional per-option added protein + wet)
```jsonc
{
  "id": "classic-burrito", "name": "Classic Burrito", "description": "Rice, beans, and cheese.",
  "variantId": "classic-burrito-base", "basePriceCents": 929,
  "modifierGroups": [
    { "id": "classic-protein", "label": "Add a protein?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [
        { "id": "classic-grilled-veggies",  "name": "Grilled Veggies",  "priceDeltaCents": 250, "doubleMeatAvailable": false, "doublePortion": null },
        { "id": "classic-steak",            "name": "Steak",            "priceDeltaCents": 299, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "classic-chicken",          "name": "Chicken",          "priceDeltaCents": 299, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "classic-shredded-beef",    "name": "Shredded Beef",    "priceDeltaCents": 299, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "classic-shredded-chicken", "name": "Shredded Chicken", "priceDeltaCents": 299, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 299 } },
        { "id": "classic-grilled-fish",     "name": "Grilled Fish",     "priceDeltaCents": 349, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 349 } },
        { "id": "classic-grilled-shrimp",   "name": "Grilled Shrimp",   "priceDeltaCents": 349, "doubleMeatAvailable": false, "doublePortion": { "priceDeltaCents": 349 } }
      ] },
    { "id": "wet-upgrade", "label": "Make it wet?", "minSelect": 0, "maxSelect": 1, "doubleMeat": null,
      "options": [ { "id": "wet", "name": "Wet (red sauce + melted cheese)", "priceDeltaCents": 429, "doubleMeatAvailable": false, "doublePortion": null } ] }
  ]
}
```

### 5d. Existing taco (UNCHANGED) — `taco-suave` from `original-tacos`
```jsonc
{
  "id": "taco-suave", "name": "Taco Suave", "variantId": "taco-suave-base", "basePriceCents": 525,
  "modifierGroups": [
    { "id": "protein", "label": "Choose one", "minSelect": 1, "maxSelect": 1,
      "doubleMeat": { "priceDeltaCents": 150 },
      "options": [
        { "id": "steak",           "name": "Steak",           "priceDeltaCents": 0, "doubleMeatAvailable": true,  "doublePortion": null },
        { "id": "grilled-veggies", "name": "Grilled Veggies", "priceDeltaCents": 0, "doubleMeatAvailable": false, "doublePortion": null }
        /* …plus chicken, shredded-beef, shredded-chicken */
      ] }
  ]
}
```
Note the taco keeps `doubleMeat` (group) + `doubleMeatAvailable` (option) and
carries `doublePortion: null` on every option. Render it exactly as before.

---

## 6. Loading / error / empty / Retry (unchanged from Original Tacos)

- Each category section loads on its own. While `burritos` is in flight, show its
  own loading state; other sections are unaffected.
- On a 500 (or network failure) for a category, show that section's error state
  with a **Retry** button that re-requests only that category.
- A 200 with `items: []` is the empty state for that category, not an error.
- Within an item, a group with `options: []` or an item with `modifierGroups: []`
  renders as a plain selectable row with no modifier controls.

---

## 7. Confirmed configured-price examples (compute from the API, do not hard-code)

These are the **displayed** totals for a given set of selections (the live price
on the card), not order lines. At most one double surcharge applies per selected
option (see §3): never add both `doublePortion` and `doubleMeat`.

Configured price = `basePriceCents` + selected option `priceDeltaCents` + (if
doubled) that option's `doublePortion.priceDeltaCents` + (if wet)
`wet.priceDeltaCents` (429).

Classic Burrito (`classic-burrito`, base 929):
| selection | computation | total (cents) |
|---|---|---|
| no added protein | 929 | 929 |
| + grilled veggies | 929 + 250 | 1179 |
| + a meat (e.g. steak) | 929 + 299 | 1228 |
| + a meat, doubled | 929 + 299 + 299 | 1527 |
| + seafood (e.g. shrimp) | 929 + 349 | 1278 |
| + seafood, doubled | 929 + 349 + 349 | 1627 |
| + wet (independent) | add 429 to any of the above | e.g. 929 + 429 = 1358 |

Grande (base 1349): steak 1349; steak doubled 1349 + 299 = 1648; + wet add 429.
Del Mar (base 1599): plain 1599; + extra shrimp 1599 + 349 = 1948; + wet add 429.

Grilled veggies and "no protein" have `doublePortion: null` — no double control,
nothing to add for doubling.

---

## 8. Frontend acceptance checklist

- [ ] `burritos` renders all seven items with correct base prices read from the API (no hard-coded amounts anywhere).
- [ ] Group A items (Fajita/Super/Grande/Bravo) treat the protein group as required-exactly-one for a *complete configuration* (it starts unselected; the computed price reflects the chosen protein); the four meats offer a +299 double control; grilled veggies offers none. (No "add to cart" is in scope — this is configuration state only.)
- [ ] Classic renders the optional added-protein group; each option's add price and double surcharge come from `priceDeltaCents` / `doublePortion`; veggies and "no protein" show no double control.
- [ ] Del Mar / Grilled Fish show NO required protein group; they show one optional +349 extra-portion control with no further doubling; included seafood is not a selectable option.
- [ ] Every burrito shows the optional wet upgrade (+429) as a modifier, independent of protein/double; there is no standalone "Wet Burrito Add On" card.
- [ ] Double-portion and wet totals match §7 exactly.
- [ ] Original Tacos rendering is unchanged: still driven by group `doubleMeat` + option `doubleMeatAvailable`; `doublePortion` (null there) is ignored for tacos.
- [ ] One generic control chooses the taco path vs the burrito path by the precedence rule in §3; neither reads both for the same control.
- [ ] Each category loads independently with its own loading/error(Retry)/empty states; a `burritos` failure does not blank other categories.
- [ ] All ids used as keys/values are the stable ids in §4, never display names; no business rule is derived from display text.

---

## 9. Files to read on the backend

- `.kiro/specs/burritos-catalog/requirements.md` — confirmed rules and acceptance criteria.
- `.kiro/specs/burritos-catalog/design.md` — modeling rationale (§1a per-option column, §3 contract).
- `.kiro/specs/burritos-catalog/tasks.md` — task breakdown (your work is Track F).
- `server/src/menu/mapRows.ts` — the exact `MenuItem`/`MenuModifierGroup`/`MenuOption` types and emit logic.
- `server/src/menu/queries.ts` — the SELECT that feeds the mapper (field names).
- `server/verify_f3_http.mjs` — a runnable example of the shape you will receive.

> **Rollout / schema-dependency note.** The new backend build selects the
> `double_portion_price_delta_cents` column (migration 0008). It therefore
> **requires 0008 to be applied before it runs at all** — not just before
> burritos appear. Running the new backend against a database that is still at
> 0001–0007 makes **every** menu query fail (the column does not exist), which
> surfaces as 500s for `original-tacos` and single-item routes too, not merely an
> empty burritos list.
>
> The correct operator order is: apply **0008 then 0009**, *then* deploy/restart
> the new backend (design §6a). Do not infer schema compatibility from a
> `burritos` call returning `200 { "items": [] }`: an empty burritos response
> before seeding is produced by the *old* backend (pre-0008) and says nothing
> about whether the new backend's column-dependent queries will work. Only 0008
> being applied establishes that.
>
> For frontend work you do not need the shared DB at all — build against
> `verify_f3_http.mjs` and the examples above; do not block on the rollout.
