// 哔哩哔哩解析器：使用官方 web 接口
const { httpGet, resolveRedirect, UA } = require('../common')

const match = (url) => /bilibili\.com|b23\.tv|acg\.tv/.test(url)

const REFERER = 'https://www.bilibili.com'

async function parse(url) {
  // 1. b23.tv 短链 -> 还原出 BV 号
  let bvid
  const direct = url.match(/BV[0-9A-Za-z]+/)
  if (direct) {
    bvid = direct[0]
  } else {
    const { finalUrl } = await resolveRedirect(url, { ua: UA.pc })
    const m = finalUrl.match(/BV[0-9A-Za-z]+/)
    if (!m) throw new Error('未能从链接中解析出 B 站 BV 号')
    bvid = m[0]
  }

  // 2. 取视频基本信息（拿到 cid）
  const { data: view } = await httpGet(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    { ua: UA.pc, headers: { Referer: REFERER } }
  )
  if (view.code !== 0) throw new Error(`B站接口返回错误：${view.message}`)
  const info = view.data
  const cid = info.cid
  const title = info.title || ''
  const author = (info.owner && info.owner.name) || ''
  const cover = info.pic || ''

  // 3. 取播放地址（platform=html5 返回单段 mp4，便于直接播放）
  const { data: play } = await httpGet(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}` +
      `&qn=64&fnval=1&platform=html5&high_quality=1`,
    { ua: UA.pc, headers: { Referer: REFERER } }
  )
  if (play.code !== 0) throw new Error(`B站播放地址获取失败：${play.message}`)
  const durl = play.data && play.data.durl && play.data.durl[0]
  if (!durl) throw new Error('未取到 B 站视频播放地址')

  return {
    type: 'video',
    title,
    author,
    cover,
    videoUrl: durl.url,
    images: [],
    // B 站视频地址播放/下载需要带 Referer，提示前端
    note: 'B站视频地址需携带 Referer 才能访问，建议通过云端下载转存。',
  }
}

module.exports = { name: 'bilibili', label: 'B站', match, parse }
