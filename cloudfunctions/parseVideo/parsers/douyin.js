// 抖音解析器：支持视频与图文
const { httpGet, resolveRedirect, UA } = require('../common')

const match = (url) => /douyin\.com|iesdouyin\.com/.test(url)

async function parse(url) {
  // 1. 跟随短链跳转，拿到真实地址，从中提取视频 id
  const { finalUrl } = await resolveRedirect(url, { ua: UA.mobile })
  const idMatch =
    finalUrl.match(/(?:video|note)\/(\d+)/) ||
    finalUrl.match(/modal_id=(\d+)/) ||
    url.match(/(?:video|note)\/(\d+)/)
  if (!idMatch) throw new Error('未能从链接中解析出抖音作品 id')
  const itemId = idMatch[1]

  // 2. 请求分享页，读取 window._ROUTER_DATA 内嵌的 JSON
  const shareUrl = `https://www.iesdouyin.com/share/video/${itemId}/`
  const { data: html } = await httpGet(shareUrl, { ua: UA.pc })
  const m = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
  if (!m) throw new Error('抖音分享页结构变化，未找到 _ROUTER_DATA')

  const routerData = JSON.parse(m[1])
  const loaderData = routerData.loaderData || {}
  // 页面 key 形如 "video_(id)/page" 或 "note_(id)/page"
  const pageKey = Object.keys(loaderData).find((k) => /page/.test(k))
  const detail =
    loaderData[pageKey] &&
    (loaderData[pageKey].videoInfoRes || loaderData[pageKey])
  const item =
    detail && detail.item_list && detail.item_list[0]
      ? detail.item_list[0]
      : null
  if (!item) throw new Error('抖音作品数据为空（可能已删除或需要登录）')

  const title = item.desc || ''
  const author = (item.author && item.author.nickname) || ''
  const cover =
    (item.video && item.video.cover && item.video.cover.url_list[0]) || ''

  // 图文作品
  if (item.images && item.images.length) {
    return {
      type: 'image',
      title,
      author,
      cover,
      images: item.images.map((i) => i.url_list[i.url_list.length - 1]),
      videoUrl: '',
    }
  }

  // 视频作品：把 playwm（带水印）替换成 play（无水印）
  let videoUrl =
    item.video && item.video.play_addr && item.video.play_addr.url_list[0]
  if (!videoUrl) throw new Error('未取到抖音视频播放地址')
  videoUrl = videoUrl.replace('playwm', 'play').replace('http://', 'https://')

  return { type: 'video', title, author, cover, videoUrl, images: [] }
}

module.exports = { name: 'douyin', label: '抖音', match, parse }
