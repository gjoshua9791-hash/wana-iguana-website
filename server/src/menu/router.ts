import { Router, type Request, type Response } from 'express'
import { queryDefaultVariant } from './queries.js'
import { sanitizeDbError } from '../db.js'
import { mapRowsToItem } from './mapRows.js'

/**
 * Wana Iguana backend — menu route (Task D3).
 *
 * GET /api/menu/items/:itemId
 *   200 → the mapped, database-backed item (design §3 shape).
 *   404 → { "error": "item_not_found", "itemId": <id> } when the item is
 *         missing/inactive or has no active default variant (query returns zero
 *         rows). We never fabricate or merge another variant.
 *   500 → { "error": "internal_error" } on any thrown DB/mapping error. The
 *         response NEVER includes the connection string, SQL, credentials, or a
 *         stack trace; details are only logged server-side.
 *
 * The query uses the existing lazy pool (verified TLS). This router performs only
 * read-only queries.
 */

export function createMenuRouter(): Router {
  const router = Router()

  router.get('/api/menu/items/:itemId', async (req: Request, res: Response) => {
    // Express types params loosely; a single named :itemId is a string at runtime.
    const itemId = String(req.params.itemId ?? '')
    if (itemId === '') {
      res.status(404).json({ error: 'item_not_found', itemId })
      return
    }
    try {
      const result = await queryDefaultVariant(itemId)
      const item = mapRowsToItem(result.rows)
      if (item === null) {
        res.status(404).json({ error: 'item_not_found', itemId })
        return
      }
      res.status(200).json(item)
    } catch (err) {
      // Log a SANITIZED description server-side (no connection string/password);
      // respond with a generic, safe body (no SQL, creds, or stack).
      console.error('menu route error for itemId=%s: %s', itemId, sanitizeDbError(err))
      res.status(500).json({ error: 'internal_error' })
    }
  })

  return router
}
