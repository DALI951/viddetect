const PLATFORMS = [
  { test: /(?:www\.)?youtube\.com/i,         name: 'YouTube' },
  { test: /(?:www\.)?youtu\.be/i,            name: 'YouTube' },
  { test: /(?:www\.)?vimeo\.com/i,           name: 'Vimeo' },
  { test: /(?:www\.)?dailymotion\.com/i,     name: 'Dailymotion' },
  { test: /(?:www\.)?twitch\.tv/i,           name: 'Twitch' },
  { test: /(?:www\.)?facebook\.com/i,        name: 'Facebook' },
  { test: /(?:www\.)?fb\.watch/i,            name: 'Facebook' },
  { test: /(?:www\.)?instagram\.com/i,        name: 'Instagram' },
  { test: /(?:www\.)?twitter\.com/i,         name: 'X (Twitter)' },
  { test: /(?:www\.)?x\.com/i,               name: 'X (Twitter)' },
  { test: /(?:www\.)?tiktok\.com/i,          name: 'TikTok' },
  { test: /(?:www\.)?reddit\.com/i,          name: 'Reddit' },
  { test: /(?:www\.)?bilibili\.com/i,        name: 'Bilibili' },
  { test: /(?:www\.)?nicovideo\.jp/i,        name: 'Niconico' },
  { test: /(?:www\.)?youku\.com/i,           name: 'Youku' },
  { test: /(?:www\.)?ted\.com/i,             name: 'TED' },
  { test: /(?:www\.)?dailymail\.com/i,       name: 'Daily Mail' },
  { test: /(?:www\.)?bbc\.(?:com|co\.uk)/i,  name: 'BBC' },
]

function instagramType(url) {
  if (/\/stories\//i.test(url)) return 'story'
  if (/\/p\/|\/reel\/|\/tv\/|\/reels\//i.test(url)) return 'post'
  return 'profile'
}

function hasPlaylist(url) {
  try {
    const u = new URL(url)
    return !!(u.searchParams.get('list') || u.searchParams.get('playlist'))
  } catch { return false }
}

export function detectSource(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    for (const p of PLATFORMS) {
      if (p.test.test(host)) {
        const source = { name: p.name, type: 'known' }
        if (p.name === 'Instagram') {
          source.igType = instagramType(url)
        }
        if (p.name === 'YouTube' && hasPlaylist(url)) {
          source.playlist = true
        }
        return source
      }
    }
    return { name: host, type: 'generic' }
  } catch {
    return null
  }
}
