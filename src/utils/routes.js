export function parseRoute(hash) {
  const match = /^#\/(home|menu|assistant|account)(?:\/([a-z0-9-]+))?\/?$/.exec(hash)
  if (!match) return { page: 'home', category: null }
  return { page: match[1], category: match[1] === 'menu' ? match[2] || null : null }
}
