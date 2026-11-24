import { useCallback, useEffect, useState } from 'react'

/**
 * Fetch the database-backed Original Tacos CATEGORY from the Express API.
 *
 * Single source for the whole category: this replaces the previous per-item
 * Taco Suave fetch on the Menu page. The backend is reached through a relative
 * URL ("/api/..."), which the Vite dev proxy forwards to Express, so the browser
 * never needs the backend address or any credential.
 *
 * State machine (mirrors the Feature 1 hook so the UI stays consistent):
 *   status: 'loading' | 'success' | 'error' | 'empty'
 *     - loading → request in flight
 *     - success → HTTP 200 with a non-empty items[] (in `items`)
 *     - empty   → HTTP 200 with items: [] (valid, authoritative empty category)
 *     - error   → network failure or a non-success HTTP status; recoverable via retry
 *
 * A successful response is AUTHORITATIVE for which items are available; callers
 * must not fall back to static data for items the API did not return. A failed
 * request never surfaces as a successful-looking category (no static substitute).
 */
export const ORIGINAL_TACOS_ENDPOINT = '/api/menu/categories/original-tacos'

export function useOriginalTacos() {
  const [status, setStatus] = useState('loading')
  const [items, setItems] = useState([])
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setStatus('loading')
    setItems([])
    setAttempt(count => count + 1)
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(ORIGINAL_TACOS_ENDPOINT, { signal: controller.signal })
        if (!active) return
        if (!response.ok) {
          // Any non-2xx (incl. 500) is a recoverable error; the category list
          // route does not use 404 for the normal case.
          setItems([])
          setStatus('error')
          return
        }
        const json = await response.json()
        if (!active) return
        const list = Array.isArray(json?.items) ? json.items : []
        setItems(list)
        setStatus(list.length === 0 ? 'empty' : 'success')
      } catch (err) {
        if (!active || err?.name === 'AbortError') return
        setItems([])
        setStatus('error')
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [attempt])

  return { status, items, retry }
}
