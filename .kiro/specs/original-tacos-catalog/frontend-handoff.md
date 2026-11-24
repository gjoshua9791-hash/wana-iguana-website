# Frontend handoff — Original Tacos category (Feature 2)

**Status:** backend is live and verified (migrations 0005–0007 applied to shared
Supabase; category endpoint returns the extended JSON over verified TLS — see
`server/VERIFICATION.md`). **All frontend work below is NOT YET IMPLEMENTED.** This
document is the agreed plan for the next session; no `src/` code is written yet.

Work only under `src/` (Track F in `tasks.md`). Do not edit backend files or
re-run migrations. The shared `src/data/menu.js` is owned by this track.

## The live API contract you build against
`GET /api/menu/categories/original-tacos` → `200`:
```jsonc
{
  "category": "original-tacos",
  "items": [
    {
      "id": "taco-suave", "name": "Taco Suave", "description": "…",
      "variantId": "taco-suave-base", "basePriceCents": 525,
      "modifierGroups": [
        {
          "id": "protein", "label": "Choose one", "minSelect": 1, "maxSelect": 1,
          "doubleMeat": { "priceDeltaCents": 150 },         // null when not offered
          "options": [
            { "id": "steak", "name": "Steak", "priceDeltaCents": 0, "doubleMeatAvailable": true },
            { "id": "grilled-veggies", "name": "Grilled Veggies", "priceDeltaCents": 0, "doubleMeatAvailable": false }
            // … five options for suave/bravo/supreme; duro = 2; del-mar = 2
          ]
        }
      ]
    }
    // taco-duro (protein-duro, doubleMeat null), taco-bravo (150),
    // taco-del-mar (protein-seafood, doubleMeat null), taco-supreme (299)
  ]
}
```
- Per-item objects are the SAME shape as the single-item route.
- Ordering is authoritative (`sort_order, id`): suave, duro, bravo, del-mar, supreme.

## Agreed presentation (this is the UX to build)
1. **Compact menu rows** that match the existing Original Tacos styling (reuse the
   current row markup/classes; do not restyle other categories). Each row shows the
   name, price, description, image (local), and the Popular tag (local) exactly as
   today.
2. **An expandable "Choose options" control** per Original Tacos row. Collapsed by
   default so the menu stays compact; expanding reveals that item's protein group
   (and double-meat control when offered). Must be keyboard-operable and accessible
   (a real button/`aria-expanded`, focusable, Enter/Space toggles).
3. **Exactly one protein, initially unselected.** Render `modifierGroups[0].options`
   as a single-select group (radio semantics). Nothing is pre-selected
   (`selectedOptionId = null`), matching Feature 1's Taco Suave behavior. `minSelect/
   maxSelect = 1/1` come from the API; display-only (no submit/blocking this feature).
4. **Optional double meat for an eligible selected meat.** Show one "Double meat
   (+$X.XX)" control (label text: **"Double meat"**, price from
   `group.doubleMeat.priceDeltaCents`). It is offerable **only when BOTH**
   `group.doubleMeat` is non-null **and** the selected option's
   `doubleMeatAvailable === true`. Disabled/hidden otherwise.
5. **Switching to veggies clears double meat.** If the user changes the protein to an
   option with `doubleMeatAvailable === false` (grilled veggies), clear any
   double-meat selection and remove its surcharge from any displayed total.
6. **Duro and Del Mar never offer double meat** — their `doubleMeat` is `null`, so the
   control is simply absent. Drive this from the data (the null), not by hard-coding
   item ids.
7. **Preserve existing styling, search, filters, images, and popularity.** The menu's
   search, category, max-price, and popular-only filters and the result counts keep
   working and agree with displayed values (reuse the Feature 1
   reconcile-before-filter approach, generalized to the category). Images, the
   category note ("Served with chips"), and the `popular` flag remain FRONTEND
   presentation metadata in `menu.js` — the API does not carry them.
8. **Authoritative success, no static fallback.** A successful category response is
   authoritative: render exactly the items it returns, in order. An Original Tacos
   item **omitted** from a 200 response is treated as unavailable and is **NOT**
   rendered from static `menu.js` data. Static entries supply only presentation
   metadata (image/popular/note) for items the API DID return, matched by stable `id`.

## Mapping to Track F tasks (see `tasks.md`)
- **F1 `MenuItemCard`** — compact row + expandable "Choose options"; protein radios
  (start empty); double-meat control gated by the canonical BOTH-conditions rule;
  clears on veggies. Taco Suave keeps its existing behavior via the wrapper path.
- **F2 `useOriginalTacos`** — fetch the category list; `loading|success|error|notFound`.
- **F3 overlay + stable ids** — `menuWithCategory` overlays API items by `id` before
  filtering; add stable ids to the four `menu.js` entries (additive); never key on
  name; omitted items are not resurrected from static data.
- **F4 in-place swap** — render `MenuItemCard` for each Original Tacos item in order;
  all other categories unchanged.
- **F5 focused checks (FC1–FC5)** — exactly-one protein; same-protein double meat;
  each surcharge (150/150/299, none for duro/del-mar); veggies clears double meat;
  Del Mar seafood $0 on 675. Plus the browser interaction checks that remain
  incomplete (keyboard, selection behavior, mobile), recorded as user-performed.

## Still incomplete (explicitly)
All of Track F (F1–F5) and every browser-interaction check. The backend and its live
verification are complete; the UI and its browser verification are not.
