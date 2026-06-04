// 小红书解析器：解析笔记页内嵌的 __INITIAL_STATE__，支持视频/图文
const { httpGet, resolveRedirect, UA } = require('../common')

const match = (url) => /xiaohongshu\.com|xhslink\.com/.test(url)

async function parse(url) {
  // 1. 还原 xhslink 短链
  const { finalUrl } = await resolveRedirect(url, { ua: UA.mobile })

  // 2. 请求笔记页
  const { data: html } = await httpGet(finalUrl, {
    ua: UA.mobile,
    headers: { Referer: 'https://www.xiaohongshu.com/' },
  })

  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})<\/script>/)
  if (!m) throw new Error('小红书笔记页结构变化，未找到 __INITIAL_STATE__')

  // 小红书的 JSON 里会有 undefined，需要替换成 null 才能 parse
  const jsonStr = m[1].replace(/undefined/g, 'null')
  const state = JSON.parse(jsonStr)

  const noteMap =
    state.note && state.note.noteDetailMap ? state.note.noteDetailMap : {}
  const firstKey = Object.keys(noteMap)[0]
  const note = firstKey && noteMap[firstKey] && noteMap[firstKey].note
  if (!note) throw new Error('小红书笔记数据为空（可能需要登录或已删除）')

  const title = note.title || note.desc || ''
  const author = (note.user && note.user.nickname) || ''

  // 视频笔记
  if (note.type === 'video' && note.video) {
    const stream =
      note.video.media &&
      note.video.media.stream &&
      (note.video.media.stream.h264 || note.video.media.stream.h265)
    const videoUrl =
      (stream && stream[0] && (stream[0].masterUrl || stream[0].backupUrls[0])) ||
      ''
    if (!videoUrl) throw new Error('未取到小红书视频播放地址')
    const cover =
      (note.imageList && note.imageList[0] && note.imageList[0].urlDefault) || ''
    return { type: 'video', title, author, cover, videoUrl, images: [] }
  }

  // 图文笔记
  const images = (note.imageList || []).map((i) => i.urlDefault || i.url)
  if (!images.length) throw new Error('未取到小红书图片')
  return {
    type: 'image',
    title,
    author,
    cover: images[0],
    videoUrl: '',
    images,
  }
}

module.exports = { name: 'xiaohongshu', label: '小红书', match, parse }
