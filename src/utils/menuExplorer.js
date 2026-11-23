import { formatCents } from './formatPrice.js'

/**
 * Return a copy of the menu with the API-backed Taco Suave reconciled into the
 * static data BEFORE search/price filtering runs, so displayed values, filter
 * matches, and the result count all agree (integration requirement).
 *
 * - On success: overlay the API-supplied name, description, and price (formatted
 *   from integer cents) onto the `taco-suave` entry, while preserving local
 *   presentation metadata (image, popular, category). The entry then filters by
 *   the same values the TacoSuaveCard displays.
 * - On any non-success status (loading/error/notFound): drop the Taco Suave entry
 *   from the filterable data so stale static values never match a search/price
 *   filter or inflate the result count. The card still renders its own state in
 *   place via the render loop; it simply is not a "matching item" yet.
 *
 * `taco` is the fetch state from useTacoSuave: `{ status, data }`.
 */
export function menuWithTacoSuave(sections, taco) {
  const status = taco?.status
  const data = taco?.data
  return sections.map(section => ({
    ...section,
    items: section.items.flatMap(item => {
      if (item.id !== 'taco-suave') return [item]
      if (status === 'success' && data) {
        const price = formatCents(data.basePriceCents)
        return [{
          ...item,
          name: data.name ?? item.name,
          description: data.description ?? item.description,
          ...(price ? { price } : {}),
        }]
      }
      // Not yet successfully loaded: exclude from filtering/counting.
      return []
    }),
  }))
}

export function filterMenuItems(sections, { search = '', category = 'all', maxPrice = 'any', popularOnly = false }) {
  const query = search.trim().toLowerCase()
  const priceLimit = maxPrice === 'any' ? Infinity : Number(maxPrice)

  return sections
    .filter(section => category === 'all' || section.category === category)
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        const matchesSearch = !query || [section.category, item.name, item.description]
          .filter(Boolean).some(value => value.toLowerCase().includes(query))
        const price = item.price ? Number(item.price.replace('$', '')) : NaN
        return matchesSearch && (!popularOnly || item.popular === true) &&
          (maxPrice === 'any' || (Number.isFinite(price) && price <= priceLimit))
      }),
    }))
    .filter(section => section.items.length > 0)
}
