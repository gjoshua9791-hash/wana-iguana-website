/**
 * Format an integer-cents amount as a USD price string for display only
 * (AC5, AC14). Prices are stored and transmitted as integer cents; the dollar
 * formatting happens only here, at the edge, never in stored data.
 *
 * Examples: 525 → "$5.25", 0 → "$0.00", 600 → "$6.00".
 * Returns null for non-finite / non-number input so callers can omit the price
 * rather than render "$NaN".
 */
export function formatCents(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) {
    return null
  }
  return `$${(cents / 100).toFixed(2)}`
}
