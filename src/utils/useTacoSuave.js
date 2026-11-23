import { useCallback, useEffect, useState } from 'react'

/**
 * Fetch the database-backed Taco Suave item from the Express API (Task E2).
 *
 * The backend is reached through a relative URL ("/api/..."), which the Vite dev
 * proxy forwards to Express (Task E1). The hook owns the request lifecycle and
 * exposes a small, explicit state machine so the UI never shows stale or
 * fabricated data:
 *
 *   status: 'loading' | 'success' | 'error' | 'notFound'
 *     - loading  → request in flight (AC6)
 *     - success  → HTTP 200 with the item JSON in `data` (AC5)
 *     - error    → network failure or a non-success status other than 404;
 *                  recoverable via `retry` (AC7)
 *     - notFound → HTTP 404 (item_not_found, incl. no active default) (AC8)
 *
 * We deliberately do NOT fall back to static data on failure: a failed API call
 * never surfaces as a successful-looking Taco Suave (no silent static display).
 */
export const TACO_SUAVE_ENDPOINT = '/api/menu/items/taco-suave'

export function useTacoSuave() {
  const [status, setStatus] = useState('loading')
  const [data, setData] = useState(null)
  // Bumping this re-runs the effect, which is how Retry re-requests the data.
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setStatus('loading')
    setData(null)
    setAttempt(count => count + 1)
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(TACO_SUAVE_ENDPOINT, { signal: controller.signal })
        if (!active) return

        if (response.status === 404) {
          setData(null)
          setStatus('notFound')
          return
        }
        if (!response.ok) {
          // 500 or any other non-success, non-404 status → recoverable error.
          setData(null)
          setStatus('error')
          return
        }

        const json = await response.json()
        if (!active) return
        setData(json)
        setStatus('success')
      } catch (err) {
        // Aborted (component unmounted / retry superseded) is not an error state.
        if (!active || err?.name === 'AbortError') return
        setData(null)
        setStatus('error')
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [attempt])

  return { status, data, retry }
}
