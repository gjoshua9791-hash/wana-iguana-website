import type { DefaultVariantRow } from './queries.js'

/**
 * Wana Iguana backend — row → JSON mapping (Task D2).
 *
 * Collapses the flat, JOIN-duplicated rows from `queryDefaultVariant()` into the
 * nested API shape from design §3. Pure and DB-free (imports only the row TYPE),
 * so it is unit-testable without a database.
 *
 * Rules:
 *  - Stable IDs (`id`, `variantId`, group/option `id`) come straight from the DB
 *    primary keys — never fabricated.
 *  - Prices are integer cents (`basePriceCents`, `priceDeltaCents`) — passed
 *    through unchanged.
 *  - Selection limits (`minSelect`/`maxSelect`) come from the join row.
 *  - A variant may legitimately have zero groups (LEFT JOIN → null group_id); an
 *    existing group may have zero options (null option_id). Null join columns must
 *    NOT create fake groups/options.
 *  - Ordering is explicit: groups by `group_sort`, options by `option_sort`, both
 *    ascending and stable, matching the query's ORDER BY. We do not rely on row
 *    arrival order; we sort explicitly so the contract holds regardless.
 */

export interface MenuOption {
  id: string
  name: string
  priceDeltaCents: number
}

export interface MenuModifierGroup {
  id: string
  label: string
  minSelect: number
  maxSelect: number
  options: MenuOption[]
}

export interface MenuItem {
  id: string
  name: string
  description: string | null
  variantId: string
  basePriceCents: number
  modifierGroups: MenuModifierGroup[]
}

/** Internal accumulator that tracks sort keys while grouping. */
interface GroupAcc {
  group: MenuModifierGroup
  groupSort: number
  optionSorts: Map<string, number>
}

/**
 * Map flat default-variant rows into a single {@link MenuItem}, or `null` when
 * there are no rows (missing/inactive item or no active default variant → the
 * route turns this into 404). Never merges fields across variants: the query
 * already restricts to one default variant, so all rows share item/variant.
 */
export function mapRowsToItem(rows: readonly DefaultVariantRow[]): MenuItem | null {
  if (rows.length === 0) {
    return null
  }

  const first = rows[0]!
  const item: MenuItem = {
    id: first.item_id,
    name: first.item_name,
    description: first.description,
    variantId: first.variant_id,
    basePriceCents: first.base_price_cents,
    modifierGroups: [],
  }

  // Group accumulators keyed by stable group id, preserving first-seen plus sort.
  const groups = new Map<string, GroupAcc>()

  for (const row of rows) {
    // Null group_id => this variant has no (more) groups on this row. Skip; do
    // not fabricate a group.
    if (row.group_id === null) {
      continue
    }

    let acc = groups.get(row.group_id)
    if (acc === undefined) {
      acc = {
        group: {
          id: row.group_id,
          label: row.label ?? '',
          minSelect: row.min_select ?? 0,
          maxSelect: row.max_select ?? 1,
          options: [],
        },
        groupSort: row.group_sort ?? 0,
        optionSorts: new Map<string, number>(),
      }
      groups.set(row.group_id, acc)
    }

    // Null option_id => group with no (more) options on this row. Skip; do not
    // fabricate an option. De-duplicate options by stable id.
    if (row.option_id !== null && !acc.optionSorts.has(row.option_id)) {
      acc.group.options.push({
        id: row.option_id,
        name: row.option_name ?? '',
        priceDeltaCents: row.price_delta_cents ?? 0,
      })
      acc.optionSorts.set(row.option_id, row.option_sort ?? 0)
    }
  }

  // Explicit, stable ordering: groups by groupSort, options by optionSort.
  const orderedGroups = [...groups.values()].sort((a, b) => a.groupSort - b.groupSort)
  for (const acc of orderedGroups) {
    acc.group.options.sort((o1, o2) => {
      const s1 = acc.optionSorts.get(o1.id) ?? 0
      const s2 = acc.optionSorts.get(o2.id) ?? 0
      return s1 - s2
    })
    item.modifierGroups.push(acc.group)
  }

  return item
}
