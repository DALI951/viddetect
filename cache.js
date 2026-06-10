const TTL = 5 * 60 * 1000

const store = new Map()

function key(url) {
  try {
    const u = new URL(url)
    u.searchParams.sort()
    return u.origin + u.pathname.replace(/\/$/, '').toLowerCase() + u.search
  } catch {
    return url
  }
}

export function cacheGet(url) {
  const k = key(url)
  const entry = store.get(k)
  if (!entry) return null
  if (Date.now() - entry.ts > TTL) {
    store.delete(k)
    return null
  }
  return entry.data
}

export function cacheSet(url, data) {
  const k = key(url)
  store.set(k, { data, ts: Date.now() })
}
