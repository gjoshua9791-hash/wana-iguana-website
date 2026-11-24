import { query } from '../db.js'
import type { QueryResult, QueryResultRow } from 'pg'

/**
 * Wana Iguana backend — menu catalog queries (Task D1).
 *
 * The default-variant query from design §4: resolve the single ACTIVE DEFAULT
 * variant of an active item FIRST (via a CTE), then LEFT JOIN only that variant's
 * modifier groups and options. Fields from other variants can never be merged.
 *
 * The item id is a PARAMETER (`$1`) — parameterized SQL prevents injection.
 * The handler/mapper layers (D2/D3) interpret an empty result as 404.
 */

/** One flat row of the joined default-variant result (nullable join columns). */
export interface DefaultVariantRow extends QueryResultRow {
  item_id: string
  item_name: string
  description: string | null
  variant_id: string
  base_price_cents: number
  group_id: string | null
  label: string | null
  min_select: number | null
  max_select: number | null
  group_sort: number | null
  // Per-item double-meat surcharge from the variant<->group link (Feature 2).
  // NULL when the item does not offer double meat on this group.
  double_meat_price_delta_cents: number | null
  option_id: string | null
  option_name: string | null
  price_delta_cents: number | null
  option_sort: number | null
  // Per-option double-meat availability (Feature 2). Non-null for any real
  // option row; LEFT JOIN nulls it only when there is no option row.
  double_meat_available: boolean | null
  // Per-option double-portion surcharge (Feature 3). NULL = this option cannot be
  // doubled; a non-null integer is the cents to add a second portion of THIS
  // option. Independent of the Feature 2 taco fields above.
  double_portion_price_delta_cents: number | null
}

/**
 * Parameterized query: the active default variant of `itemId` (an active item),
 * with its modifier groups and options. Returns zero rows when the item is
 * missing/inactive or has no active default variant (handled as 404 upstream).
 */
export const DEFAULT_VARIANT_SQL = `
WITH default_variant AS (
  SELECT iv.id, iv.item_id, iv.base_price_cents
  FROM public.item_variant iv
  JOIN public.menu_item mi ON mi.id = iv.item_id AND mi.is_active
  WHERE iv.item_id = $1
    AND iv.is_default
    AND iv.is_active
  LIMIT 1               -- partial unique index guarantees at most one; LIMIT is a guard
)
SELECT mi.id   AS item_id, mi.name AS item_name, mi.description,
       dv.id   AS variant_id, dv.base_price_cents,
       mg.id   AS group_id, mg.label, vmg.min_select, vmg.max_select,
       vmg.sort_order AS group_sort,
       vmg.double_meat_price_delta_cents,
       mo.id   AS option_id, mo.name AS option_name, mo.price_delta_cents,
       mo.sort_order AS option_sort,
       mo.double_meat_available,
       mo.double_portion_price_delta_cents
FROM default_variant dv
JOIN public.menu_item mi            ON mi.id = dv.item_id
LEFT JOIN public.variant_modifier_group vmg ON vmg.variant_id = dv.id
LEFT JOIN public.modifier_group mg          ON mg.id = vmg.group_id
LEFT JOIN public.modifier_option mo         ON mo.group_id = mg.id
ORDER BY vmg.sort_order, mo.sort_order
`

/** Run the default-variant query for a given item id (parameterized). */
export function queryDefaultVariant(itemId: string): Promise<QueryResult<DefaultVariantRow>> {
  return query<DefaultVariantRow>(DEFAULT_VARIANT_SQL, [itemId])
}

/** One row of the category item-id listing (ordered). */
export interface CategoryItemIdRow extends QueryResultRow {
  id: string
}

/**
 * Parameterized query: the active items of a category, in deterministic display
 * order (sort_order, then id as a stable tie-breaker). Returns ids only; the
 * route resolves each id through queryDefaultVariant + the mapper so the list
 * reuses the exact single-item shape and default-variant/no-merge semantics.
 */
export const CATEGORY_ITEM_IDS_SQL = `
SELECT id
FROM public.menu_item
WHERE category = $1
  AND is_active
ORDER BY sort_order, id
`

/** Run the category item-id listing for a category slug (parameterized). */
export function queryCategoryItemIds(category: string): Promise<QueryResult<CategoryItemIdRow>> {
  return query<CategoryItemIdRow>(CATEGORY_ITEM_IDS_SQL, [category])
}
