import { Router, type Request, type Response } from 'express'
import type { QueryResult } from 'pg'
import {
  queryCategoryItemIds as realQueryCategoryItemIds,
  queryDefaultVariant as realQueryDefaultVariant,
  type CategoryItemIdRow,
  type DefaultVariantRow,
} from './queries.js'
import { sanitizeDbError } from '../db.js'
import { mapRowsToItem, type MenuItem } from './mapRows.js'

/**
 * Dependency seam (Feature 2 tests). The route depends on these two query
 * functions, which default to the real DB-backed implementations. Tests may
 * inject fakes to provide rows or force a failure WITHOUT touching db.ts or TLS
 * (the production pool and its verified-TLS config are never involved in an
 * injected test). This is an HTTP-level test seam, NOT a way to reach the DB.
 */
export interface CategoryRouterDeps {
  queryCategoryItemIds: (category: string) => Promise<QueryResult<CategoryItemIdRow>>
  queryDefaultVariant: (itemId: string) => Promise<QueryResult<DefaultVariantRow>>
}

/**
 * Wana Iguana backend — category list route (Feature 2).
 *
 * GET /api/menu/categories/:categoryId
 *   200 → { category, items } where `items` is the category's active items, in
 *         deterministic order (sort_order, id), each using the SAME extended
 *         per-item JSON as GET /api/menu/items/:itemId (incl. the additive
 *         `doubleMeat` / `doubleMeatAvailable` fields). This is AUTHORITATIVE:
 *         an item with no active default variant is OMITTED from `items` (not a
 *         404 for the whole list); an empty category is a valid 200 with items:[].
 *   500 → { "error": "internal_error" } on any thrown DB/mapping error. The body
 *         never includes SQL, credentials, or a stack; details are logged
 *         server-side only (sanitized).
 *
 * This route is READ-ONLY. It reuses the existing lazy pool (verified TLS) and the
 * existing per-item query + mapper, so it inherits the deterministic
 * default-variant / no-merge semantics. It is a NEW file: it does not modify the
 * single-item router, whose contract and behavior are preserved.
 */

interface CategoryResponse {
  category: string
  items: MenuItem[]
}

export function createCategoryRouter(deps: CategoryRouterDeps = {
  queryCategoryItemIds: realQueryCategoryItemIds,
  queryDefaultVariant: realQueryDefaultVariant,
}): Router {
  const router = Router()

  router.get('/api/menu/categories/:categoryId', async (req: Request, res: Response) => {
    const categoryId = String(req.params.categoryId ?? '')
    try {
      const idRows = await deps.queryCategoryItemIds(categoryId)
      const items: MenuItem[] = []
      // Resolve each id through the same default-variant query + mapper used by
      // the single-item route. Items that map to null (no active default variant)
      // are omitted — the list stays authoritative for what is available. An
      // unknown category simply yields zero ids -> items: [] (per spec §3b, we do
      // not 404 an unknown category path in this feature).
      for (const { id } of idRows.rows) {
        const result = await deps.queryDefaultVariant(id)
        const item = mapRowsToItem(result.rows)
        if (item !== null) {
          items.push(item)
        }
      }
      const body: CategoryResponse = { category: categoryId, items }
      res.status(200).json(body)
    } catch (err) {
      console.error('category route error for categoryId=%s: %s', categoryId, sanitizeDbError(err))
      res.status(500).json({ error: 'internal_error' })
    }
  })

  return router
}
