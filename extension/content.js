console.log('[viddetect] loaded')

if (window.__vd_run) {
  console.log('[viddetect] already running')
} else {
window.__vd_run = true

var btn = null
var statusText = null

function c(tag) { return document.createElement(tag) }
function t(text) { return document.createTextNode(text) }

function createBtn() {
  btn = c('div')
  btn.id = '__vd_btn'
  btn.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#e05a3a;color:#fff;padding:8px 16px;border-radius:20px;font:600 13px/1.4 sans-serif;z-index:99999;cursor:pointer;box-shadow:0 2px 12px rgba(224,90,58,.4);user-select:none;transition:transform .15s;display:none'
  btn.onmouseenter = function(){ this.style.transform = 'scale(1.05)' }
  btn.onmouseleave = function(){ this.style.transform = 'scale(1)' }
  btn.onclick = send
  statusText = t('viddetect')
  btn.appendChild(statusText)
  document.body.appendChild(btn)
  console.log('[viddetect] button created')
}

function setText(text) {
  while (btn.firstChild) btn.removeChild(btn.firstChild)
  btn.appendChild(t(text))
}

function send() {
  var data = window.ytInitialData
  console.log('[viddetect] send clicked, data:', data ? 'found' : 'null')
  if (!data) { setText('no data'); return }
  var listId = new URLSearchParams(location.search).get('list')
  if (!listId) { setText('no list'); return }
  var playlist = data?.contents?.twoColumnWatchNextResults?.playlist?.playlist
  var contents = playlist?.contents || data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results
  console.log('[viddetect] contents:', contents ? contents.length + ' items' : 'null')
  if (!contents || !contents.length) { setText('no panel'); return }
  var entries = []
  for (var i = 0; i < contents.length; i++) {
    var r = contents[i]?.playlistPanelVideoRenderer
    if (!r) continue
    var tit = r.title?.simpleText || r.title?.runs?.[0]?.text
    if (!tit) continue
    var u = ''
    if (r.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) u = 'https://www.youtube.com' + r.navigationEndpoint.commandMetadata.webCommandMetadata.url
    else if (r.navigationEndpoint?.watchEndpoint?.videoId) u = 'https://www.youtube.com/watch?v=' + r.navigationEndpoint.watchEndpoint.videoId
    else if (r.videoId) u = 'https://www.youtube.com/watch?v=' + r.videoId
    if (!u) continue
    entries.push({title:tit, url:u, thumbnail:r.thumbnail?.thumbnails?.[0]?.url||null, duration:r.lengthSeconds?parseInt(r.lengthSeconds):null})
  }
  console.log('[viddetect] parsed entries:', entries.length)
  if (!entries.length) { setText('0 entries'); return }
  setText('sending...')
  btn.style.background = '#2a8a4a'
  fetch('http://localhost:3001/api/bookmarklet-data', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listId:listId, entries:entries, pageUrl:location.href, playlistTitle:'YouTube Mix'})})
  .then(function(r){return r.json()}).then(function(d){ console.log('[viddetect] response:', d); setText(d.success ? 'sent ' + d.count : 'error') })
  .catch(function(e){ console.log('[viddetect] fetch error:', e); setText('offline?'); btn.style.background = '#c0392b' })
}

function update() {
  if (!document.body) { setTimeout(update, 200); return }
  if (!btn) createBtn()
  var listId = new URLSearchParams(location.search).get('list')
  console.log('[viddetect] update, listId:', listId, 'ytInitialData:', typeof window.ytInitialData)
  if (listId) {
    btn.style.display = 'block'
    setText(window.ytInitialData ? 'viddetect ✓' : 'viddetect...')
  } else {
    btn.style.display = 'none'
  }
}

update()
setInterval(update, 2000)
window.addEventListener('yt-navigate-finish', update)

console.log('[viddetect] initialized')
}
