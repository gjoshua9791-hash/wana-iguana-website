import { formatCents } from './formatPrice.js'

/**
 * Reconcile a database-backed CATEGORY into the static menu BEFORE search/price
 * filtering, so displayed values, filter matches, and counts all agree.
 *
 * `cat` is the fetch state from useOriginalTacos: `{ status, items }`.
 * `categoryName` is the static section name to reconcile (e.g. "Original Tacos").
 *
 * On success: the named section's items become the API items, in API order
 * (authoritative), matched to the static entry by stable `id` to carry local
 * presentation metadata (image, popular) and keep the category `note`. Each
 * reconciled entry also carries:
 *   - `name`/`description` from the API,
 *   - `price` as a formatted string derived from the API `basePriceCents` (this is
 *     the BASE price; the filter layer and max-price filter use this, not any
 *     configured double-meat total),
 *   - `apiItem`: the full API item object (modifier groups/options), for the card.
 * A static entry whose `id` is NOT in the API response is DROPPED (authoritative
 * omission — no static fallback for an item the API did not return). Static entries
 * never add items the API omitted.
 *
 * On any non-success status (loading/empty/error): the named section's items are
 * emptied so stale static values never match a filter or inflate counts; the page
 * renders a category-level loading/empty/error notice in that section's place.
 * Every OTHER category is returned unchanged.
 */
export function menuWithCategory(sections, cat, categoryName) {
  const status = cat?.status
  const apiItems = Array.isArray(cat?.items) ? cat.items : []

  return sections.map(section => {
    if (section.category !== categoryName) return section
    if (status !== 'success') {
      // loading / empty / error: no filterable items for this category.
      return { ...section, items: [] }
    }
    const staticById = new Map(
      section.items.filter(it => it.id).map(it => [it.id, it]),
    )
    // API order is authoritative. Each API item carries local metadata (by id)
    // plus a base-price string for the filter layer and the full apiItem.
    const items = apiItems.map(apiItem => {
      const local = staticById.get(apiItem.id) ?? {}
      const price = formatCents(apiItem.basePriceCents)
      return {
        ...local, // image, popular, any other local presentation metadata
        id: apiItem.id,
        name: apiItem.name ?? local.name,
        description: apiItem.description ?? local.description,
        ...(price ? { price } : {}),
        apiItem,
      }
    })
    return { ...section, items }
  })
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
