// 抖音解析器（健壮版）：多端点 + 手机UA优先 + 深度搜索 + 多种数据格式兜底
// 说明：抖音页面结构经常变动，这里不依赖固定的 JSON 路径，
// 而是把页面里能找到的所有内嵌 JSON 解析出来，再深度遍历找出“作品对象”。
const { httpGet, resolveRedirect, UA } = require('../common')

const match = (url) => /douyin\.com|iesdouyin\.com/.test(url)

// 取 { url_list: [...] } / 字符串 / 数组 里的一个可用 url
function firstUrl(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return firstUrl(node[0])
  if (Array.isArray(node.url_list) && node.url_list.length) return node.url_list[0]
  return ''
}

// 从一段 HTML 里、按标记取出后面紧跟的一个“配平大括号”的 JSON 字符串
function sliceBalanced(s, openIdx) {
  let depth = 0
  let inStr = false
  let esc = false
  let quote = ''
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === quote) inStr = false
    } else if (c === '"' || c === "'") {
      inStr = true
      quote = c
    } else if (c === '{') {
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(openIdx, i + 1)
    }
  }
  return null
}

function extractByMarker(html, marker) {
  const idx = html.indexOf(marker)
  if (idx === -1) return null
  const brace = html.indexOf('{', idx + marker.length)
  if (brace === -1) return null
  return sliceBalanced(html, brace)
}

// 老版本抖音会把数据放在 <script id="RENDER_DATA">（内容是 encodeURIComponent 后的 JSON）
function extractRenderData(html) {
  const m = html.match(/<script[^>]*id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch (e) {
    return m[1]
  }
}

// 深度遍历，找出第一个“像抖音作品”的对象
function findAweme(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null
  const isVideo = node.video && (node.video.play_addr || node.video.playApi || node.video.play_url)
  const isImage = Array.isArray(node.images) && node.images.length && (node.desc !== undefined || node.aweme_id || node.awemeId)
  if (isVideo || isImage) return node
  for (const k of Object.keys(node)) {
    const found = findAweme(node[k], depth + 1)
    if (found) return found
  }
  return null
}

// 把一段 HTML 里所有候选 JSON 都解析出来，逐个深度搜索作品对象
function findAwemeInHtml(html) {
  const candidates = []
  for (const marker of ['_ROUTER_DATA', '__INIT_PROPS__', '__INITIAL_SSR_STATE__']) {
    const s = extractByMarker(html, marker)
    if (s) candidates.push(s)
  }
  const rd = extractRenderData(html)
  if (rd) candidates.push(rd)

  for (const c of candidates) {
    try {
      const json = JSON.parse(c.replace(/:\s*undefined/g, ':null'))
      const found = findAweme(json)
      if (found) return found
    } catch (e) {
      /* 解析失败就试下一个候选 */
    }
  }
  return null
}

async function parse(url) {
  // 1. 短链还原 -> 取作品 id
  const { finalUrl } = await resolveRedirect(url, { ua: UA.mobile })
  const idMatch =
    finalUrl.match(/(?:video|note|slides)\/(\d+)/) ||
    finalUrl.match(/modal_id=(\d+)/) ||
    url.match(/(?:video|note|slides)\/(\d+)/)
  if (!idMatch) {
    throw new Error('未能从链接中解析出作品 id，落地地址：' + finalUrl.slice(0, 120))
  }
  const id = idMatch[1]

  // 2. 依次尝试多个端点（手机 UA 优先，抖音对手机 UA 才内嵌数据）
  const headers = {
    Referer: 'https://www.douyin.com/',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  }
  const attempts = [
    { url: `https://www.iesdouyin.com/share/video/${id}/`, ua: UA.mobile },
    { url: `https://www.iesdouyin.com/share/slides/${id}/`, ua: UA.mobile },
    { url: `https://www.iesdouyin.com/share/note/${id}/`, ua: UA.mobile },
    { url: `https://www.iesdouyin.com/share/video/${id}/`, ua: UA.pc },
  ]

  let aweme = null
  let lastSnippet = ''
  for (const a of attempts) {
    try {
      const { data: html } = await httpGet(a.url, { ua: a.ua, headers, timeout: 9000 })
      const text = typeof html === 'string' ? html : JSON.stringify(html)
      lastSnippet = text.replace(/\s+/g, ' ').slice(0, 150)
      aweme = findAwemeInHtml(text)
      if (aweme) break
    } catch (e) {
      lastSnippet = '请求异常：' + (e.message || '')
    }
  }

  if (!aweme) {
    throw new Error(
      '未能从抖音页面解析到作品数据（可能被风控/需要验证，请稍后重试或换一条链接）。页面片段：' +
        lastSnippet
    )
  }

  // 3. 组装结果
  const title = aweme.desc || aweme.title || ''
  const author =
    (aweme.author && (aweme.author.nickname || aweme.author.nick_name)) || ''
  const cover =
    firstUrl(aweme.video && aweme.video.cover) ||
    firstUrl(aweme.video && aweme.video.origin_cover) ||
    firstUrl(aweme.images && aweme.images[0])

  // 图文作品
  if (Array.isArray(aweme.images) && aweme.images.length) {
    const images = aweme.images.map((i) => firstUrl(i)).filter(Boolean)
    if (images.length) {
      return { type: 'image', title, author, cover, videoUrl: '', images }
    }
  }

  // 视频作品：playwm -> play 去水印
  let videoUrl = firstUrl(
    (aweme.video && aweme.video.play_addr) ||
      (aweme.video && aweme.video.playApi) ||
      (aweme.video && aweme.video.play_url)
  )
  if (!videoUrl) throw new Error('已找到作品，但未取到视频播放地址')
  videoUrl = videoUrl
    .replace('playwm', 'play')
    .replace(/^http:/, 'https:')

  return { type: 'video', title, author, cover, videoUrl, images: [] }
}

module.exports = { name: 'douyin', label: '抖音', match, parse }
