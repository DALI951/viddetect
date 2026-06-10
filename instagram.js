import https from 'https'
import { instagramGetUrl } from 'instagram-url-direct'
import { ensureYtDlp, ytdlp } from './extract.js'

export async function extractInstagramPost(instaUrl) {
  const result = await instagramGetUrl(instaUrl)

  const formats = result.media_details.map((item, i) => {
    const isVideo = item.type === 'video'
    return {
      format_id: `instagram-${i}`,
      url: item.url,
      ext: isVideo ? 'mp4' : 'jpg',
      mime: isVideo ? 'video/mp4' : 'image/jpeg',
      resolution: isVideo
        ? `${item.dimensions.height}p`
        : `${item.dimensions.width}x${item.dimensions.height}`,
      height: item.dimensions.height,
      width: item.dimensions.width,
      has_video: isVideo,
      has_audio: isVideo,
      format_note: isVideo ? 'Original Instagram Video' : 'Original Instagram Image',
      filesize: null,
      thumbnail: item.thumbnail || null,
    }
  })

  return {
    title: result.post_info?.caption?.slice(0, 100) || `Instagram by ${result.post_info?.owner_username || 'unknown'}`,
    thumbnail: result.media_details[0]?.thumbnail || null,
    duration: null,
    uploader: result.post_info?.owner_username || null,
    webpageUrl: instaUrl,
    formats,
  }
}

function decodeHtmlEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&#38;/g, '&')
}

function fetchOgImage(html) {
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
  return m ? decodeHtmlEntities(m[1]) : null
}

function fetchJsonLdImage(html) {
  const m = html.match(/<script\s+type="application\/ld\+json"[^>]*>([^<]+)<\/script>/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1])
    const url = parsed?.image?.url || parsed?.image || null
    return url ? decodeHtmlEntities(url) : null
  } catch {
    return null
  }
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, res => {
      let html = ''
      res.on('data', c => html += c)
      res.on('end', () => resolve(html))
    }).on('error', reject)
  })
}

export async function extractInstagramProfile(url) {
  const html = await fetchPage(url)
  const ogImage = fetchOgImage(html) || fetchJsonLdImage(html)
  if (!ogImage) throw new Error('Could not find profile picture on this page')

  const username = url.replace(/\/+$/, '').split('/').pop() || 'instagram'

  return {
    title: `${username} (profile picture)`,
    thumbnail: ogImage,
    duration: null,
    uploader: username,
    webpageUrl: url,
    formats: [{
      resolution: 'Original',
      format: 'JPG',
      ext: 'jpg',
      size: null,
      height: 0,
      url: ogImage,
    }],
  }
}

export async function extractInstagramStory(url) {
  await ensureYtDlp()
  const result = await ytdlp.getFormatsAsync(url, { noPlaylist: true })
  const data = result.info || result
  if (!data?.formats?.length) throw new Error('No story formats found')
  const byRes = {}
  for (const f of data.formats || []) {
    if (!f.url) continue
    const label = f.format_note || f.resolution || String(f.height || f.width || 0)
    if (!byRes[label]) byRes[label] = []
    byRes[label].push(f)
  }
  const formats = []
  for (const [res, items] of Object.entries(byRes)) {
    const best = items.sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0]
    if (!best) continue
    formats.push({
      resolution: res,
      format: (best.ext || '').toUpperCase(),
      ext: best.ext || 'mp4',
      size: best.filesize || best.filesize_approx || null,
      height: parseInt(best.height) || 0,
      url: best.url,
    })
  }
  formats.sort((a, b) => b.height - a.height)
  return {
    title: data.title || data.fulltitle || 'Untitled',
    thumbnail: data.thumbnail || null,
    duration: data.duration ? parseInt(data.duration) : null,
    uploader: data.uploader || data.channel || null,
    webpageUrl: data.webpage_url || url,
    formats,
  }
}
