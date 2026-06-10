import { YtDlp } from 'ytdlp-nodejs'
const ytdlp = new YtDlp()

try {
  const result = await ytdlp.getFormatsAsync(
    'https://www.youtube.com/watch?v=fBpnPpDQpP8&list=RDu9azzEPqyg8&index=5',
    { noPlaylist: true }
  )
  const data = result.info || result
  console.log('has formats?', !!data?.formats?.length, 'has entries?', !!data?.entries?.length, 'type:', data?._type)
  if (data?.formats?.length) {
    console.log('format count:', data.formats.length)
  }
} catch (e) {
  console.error('Error:', e.message)
}

// Compare without noPlaylist
try {
  const result2 = await ytdlp.getFormatsAsync(
    'https://www.youtube.com/watch?v=fBpnPpDQpP8&list=RDu9azzEPqyg8&index=5'
  )
  const data2 = result2.info || result2
  console.log('\nWithout noPlaylist:')
  console.log('has formats?', !!data2?.formats?.length, 'has entries?', !!data2?.entries?.length, 'type:', data2?._type)
} catch (e) {
  console.error('Error:', e.message)
}
