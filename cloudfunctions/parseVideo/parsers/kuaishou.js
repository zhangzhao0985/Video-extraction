// 快手解析器（健壮版）：多端点 + 内嵌 JSON 深度搜索 + 正则兜底
// 说明：快手对服务器端抓取风控较强，属“尽力而为”，失效时可能需重试或更新规则。
const { httpGet, resolveRedirect, UA } = require('../common')

const match = (url) =>
  /kuaishou\.com|gifshow\.com|chenzhongtech\.com|kwai/.test(url)

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

// 深度遍历找第一个 mp4 直链
function deepFindMp4(node, depth = 0) {
  if (node == null || depth > 14) return ''
  if (typeof node === 'string') {
    return /^https?:\/\/[^\s"']+\.mp4/.test(node) ? node : ''
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const r = deepFindMp4(node[k], depth + 1)
      if (r) return r
    }
  }
  return ''
}

async function parse(url) {
  // 1. 还原短链
  const { finalUrl } = await resolveRedirect(url, { ua: UA.mobile })
  const photoId = (finalUrl.match(/(?:short-video|photo|f|fw)\/([A-Za-z0-9_-]+)/) || [])[1]

  const headers = {
    Referer: 'https://www.kuaishou.com/',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }
  const attempts = [{ url: finalUrl, ua: UA.mobile }]
  if (photoId) attempts.push({ url: `https://www.kuaishou.com/short-video/${photoId}`, ua: UA.pc })

  let videoUrl = ''
  let title = ''
  let cover = ''
  let lastSnippet = ''

  for (const a of attempts) {
    try {
      const { data: html } = await httpGet(a.url, { ua: a.ua, headers, timeout: 9000 })
      const text = typeof html === 'string' ? html : JSON.stringify(html)
      lastSnippet = text.replace(/\s+/g, ' ').slice(0, 150)

      // a) 内嵌 JSON 深度搜索
      for (const marker of ['__APOLLO_STATE__', '__INITIAL_STATE__', 'INIT_STATE']) {
        const raw = extractByMarker(text, marker)
        if (!raw) continue
        try {
          const json = JSON.parse(raw.replace(/undefined/g, 'null'))
          const u = deepFindMp4(json)
          if (u) {
            videoUrl = u
            break
          }
        } catch (e) {
          /* 试下一个标记 */
        }
      }

      // b) 正则从字段名直接兜底
      if (!videoUrl) {
        const m = text.match(
          /"(?:photoUrl|srcNoMark|mainMvUrls?|playUrl|url)"\s*:\s*"(https?:[^"]+?\.mp4[^"]*)"/
        )
        if (m) videoUrl = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/')
      }
      // c) 正则抓任意 mp4
      if (!videoUrl) {
        const m2 = text.match(/(https?:[^"'\\ ]+?\.mp4[^"'\\ ]*)/)
        if (m2) videoUrl = m2[1]
      }

      // 标题 / 封面尽力提取
      if (!title) {
        const t = text.match(/<title>([^<]*)<\/title>/)
        if (t) title = t[1].replace(/[_\-]?\s*快手.*/, '').trim()
      }
      if (!cover) {
        const c =
          text.match(/"coverUrls?"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/) ||
          text.match(/"coverUrl"\s*:\s*"([^"]+)"/)
        if (c) cover = c[1].replace(/\\u002F/g, '/')
      }

      if (videoUrl) break
    } catch (e) {
      lastSnippet = '请求异常：' + (e.message || '')
    }
  }

  if (!videoUrl) {
    throw new Error(
      '未取到快手视频地址（快手对服务器抓取风控较强，请稍后重试或更换链接）。页面片段：' +
        lastSnippet
    )
  }

  videoUrl = videoUrl.replace(/^http:/, 'https:')
  return { type: 'video', title, author: '', cover, videoUrl, images: [] }
}

module.exports = { name: 'kuaishou', label: '快手', match, parse }
