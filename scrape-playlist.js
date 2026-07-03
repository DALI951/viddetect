import https from 'https'

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, res => {
      let html = ''
      res.on('data', c => html += c)
      res.on('end', () => resolve(html))
    }).on('error', reject)
  })
}

function extractInitialData(html) {
  const markers = [
    'window["ytInitialData"]=',
    "window['ytInitialData']=",
    'window.ytInitialData=',
    'var ytInitialData=',
  ]
  for (const marker of markers) {
    let idx = html.indexOf(marker)
    if (idx === -1) continue
    idx += marker.length
    if (html[idx] === ' ') idx++
    if (html[idx] !== '{') continue
    let depth = 0
    let start = idx
    let inString = false
    let escape = false
    for (let i = start; i < html.length; i++) {
      const ch = html[i]
      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { idx = i; break } }
    }
    if (depth === 0) {
      try { return JSON.parse(html.slice(start, idx + 1)) } catch {}
    }
  }
  return null
}

function parseEntries(data) {
  const entries = []
  try {
    let playlistContents = data?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents
    if (!playlistContents) {
      playlistContents = data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results
    }
    if (!playlistContents) return []
    for (const item of playlistContents) {
      const r = item?.playlistPanelVideoRenderer
      if (!r) continue
      let title = ''
      if (r.title?.simpleText) {
        title = r.title.simpleText
      } else if (r.title?.runs?.[0]?.text) {
        title = r.title.runs[0].text
      }
      if (!title) continue
      let url = ''
      if (r.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
        url = 'https://www.youtube.com' + r.navigationEndpoint.commandMetadata.webCommandMetadata.url
      } else if (r.navigationEndpoint?.watchEndpoint?.videoId) {
        url = `https://www.youtube.com/watch?v=${r.navigationEndpoint.watchEndpoint.videoId}`
      } else if (r.videoId) {
        url = `https://www.youtube.com/watch?v=${r.videoId}`
      }
      if (!url) continue
      const thumbnail = r.thumbnail?.thumbnails?.[0]?.url || null
      const duration = r.lengthSeconds ? parseInt(r.lengthSeconds) : null
      entries.push({ title, url, thumbnail, duration })
    }
  } catch {}
  return entries
}

let cachedData = null
let cachedUrl = ''

export async function getRdMixPage(url, page = 1, perPage = 10) {
  if (cachedUrl !== url) {
    cachedUrl = url
    const html = await fetchPage(url)
    const data = extractInitialData(html)
    if (!data) throw new Error('Could not parse YouTube page data')
    cachedData = parseEntries(data)
  }
  const all = cachedData
  const start = (page - 1) * perPage
  const end = start + perPage
  const entries = all.slice(start, end)
  return {
    entries,
    playlistTitle: 'YouTube Mix',
    totalCount: all.length,
    hasMore: end < all.length,
  }
}
