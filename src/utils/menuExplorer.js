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
