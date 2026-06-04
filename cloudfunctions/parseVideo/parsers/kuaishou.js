// 快手解析器：解析分享页内嵌的 __APOLLO_STATE__ / INIT_STATE
const { httpGet, resolveRedirect, UA } = require('../common')

const match = (url) =>
  /kuaishou\.com|gifshow\.com|chenzhongtech\.com|kwai/.test(url)

function pickFirstUrl(node) {
  // 在对象树里递归找第一个像 mp4 播放地址的字段
  if (!node || typeof node !== 'object') return null
  for (const k of Object.keys(node)) {
    const v = node[k]
    if (typeof v === 'string' && /^https?:\/\/.*\.mp4/.test(v)) return v
    if (typeof v === 'object') {
      const found = pickFirstUrl(v)
      if (found) return found
    }
  }
  return null
}

async function parse(url) {
  // 1. 还原短链，并请求落地页
  const { finalUrl } = await resolveRedirect(url, { ua: UA.mobile })
  const { data: html } = await httpGet(finalUrl, {
    ua: UA.mobile,
    headers: { Referer: 'https://www.kuaishou.com/' },
  })

  // 2. 抓取页面内嵌的初始状态 JSON
  let state = null
  const patterns = [
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});/,
    /window\.INIT_STATE\s*=\s*(\{[\s\S]*?\});/,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) {
      try {
        state = JSON.parse(m[1])
        break
      } catch (e) {
        /* 继续尝试下一个 */
      }
    }
  }
  if (!state) throw new Error('快手分享页结构变化，未能解析数据')

  const videoUrl = pickFirstUrl(state)
  if (!videoUrl) throw new Error('未取到快手视频播放地址')

  // 标题/封面尽力而为地提取
  let title = ''
  let cover = ''
  const capMatch = html.match(/<title>([^<]*)<\/title>/)
  if (capMatch) title = capMatch[1].replace(/_快手.*/, '').trim()
  const coverMatch = html.match(/"coverUrl"\s*:\s*"([^"]+)"/)
  if (coverMatch) cover = coverMatch[1].replace(/\\u002F/g, '/')

  return { type: 'video', title, author: '', cover, videoUrl, images: [] }
}

module.exports = { name: 'kuaishou', label: '快手', match, parse }
