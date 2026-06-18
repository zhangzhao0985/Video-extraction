// 小红书解析器（健壮版）：保留 xsec_token + 配平括号提取 + 结构化/深度搜索兜底
// 支持视频笔记与图文笔记。注意：小红书对服务器抓取风控较强，
// 链接最好用 App「分享 → 复制链接」得到（带 xsec_token）。
const { httpGet, resolveRedirect, UA } = require('../common')

const match = (url) => /xiaohongshu\.com|xhslink\.com/.test(url)

// 配平大括号，从 openIdx 处的 '{' 取出完整 JSON 字符串
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

// 结构化路径：state.note.noteDetailMap[firstNoteId].note
function extractNoteStructured(json) {
  const n = json && json.note
  if (!n || !n.noteDetailMap) return null
  const id =
    n.firstNoteId && n.noteDetailMap[n.firstNoteId]
      ? n.firstNoteId
      : Object.keys(n.noteDetailMap)[0]
  return id && n.noteDetailMap[id] ? n.noteDetailMap[id].note : null
}

// 兜底：深度遍历，找“像小红书笔记”的对象（有 type 且含 imageList 或 video）
function findNote(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 14) return null
  if (
    (node.type === 'video' || node.type === 'normal' || node.type === 'note') &&
    (Array.isArray(node.imageList) || node.video)
  ) {
    return node
  }
  for (const k of Object.keys(node)) {
    const found = findNote(node[k], depth + 1)
    if (found) return found
  }
  return null
}

async function parse(url) {
  // 1. 还原短链（关键：保留落地 URL 上的 xsec_token）
  const { finalUrl } = await resolveRedirect(url, { ua: UA.mobile })

  // 2. 请求笔记页（用完整 finalUrl，含 token），桌面/移动 UA 各试一次
  const headers = {
    Referer: 'https://www.xiaohongshu.com/',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }
  const attempts = [
    { url: finalUrl, ua: UA.pc },
    { url: finalUrl, ua: UA.mobile },
  ]

  let note = null
  let lastSnippet = ''
  for (const a of attempts) {
    try {
      const { data: html } = await httpGet(a.url, { ua: a.ua, headers, timeout: 9000 })
      const text = typeof html === 'string' ? html : JSON.stringify(html)
      lastSnippet = text.replace(/\s+/g, ' ').slice(0, 150)
      for (const marker of ['__INITIAL_STATE__', '__INITIAL_SSR_STATE__']) {
        const raw = extractByMarker(text, marker)
        if (!raw) continue
        try {
          const json = JSON.parse(raw.replace(/undefined/g, 'null'))
          note = extractNoteStructured(json) || findNote(json)
          if (note) break
        } catch (e) {
          /* 试下一个标记 */
        }
      }
      if (note) break
    } catch (e) {
      lastSnippet = '请求异常：' + (e.message || '')
    }
  }

  if (!note) {
    throw new Error(
      '未能解析到小红书笔记数据（可能需要登录或被风控）。建议在小红书 App 用' +
        '「分享 → 复制链接」重新获取带 token 的链接后再试。页面片段：' +
        lastSnippet
    )
  }

  const title = note.title || note.desc || ''
  const author = (note.user && (note.user.nickname || note.user.nickName)) || ''
  const cover =
    (note.imageList && note.imageList[0] && note.imageList[0].urlDefault) || ''

  // 视频笔记
  if (note.video) {
    const stream = note.video.media && note.video.media.stream
    let videoUrl = ''
    if (stream) {
      for (const codec of ['h264', 'h265', 'av1', 'h266']) {
        const arr = stream[codec]
        if (Array.isArray(arr) && arr.length) {
          videoUrl =
            arr[0].masterUrl ||
            (arr[0].backupUrls && arr[0].backupUrls[0]) ||
            ''
          if (videoUrl) break
        }
      }
    }
    // 兜底：用 originVideoKey 拼地址
    if (!videoUrl && note.video.consumer && note.video.consumer.originVideoKey) {
      videoUrl = 'https://sns-video-bd.xhscdn.com/' + note.video.consumer.originVideoKey
    }
    if (videoUrl) {
      return { type: 'video', title, author, cover, videoUrl, images: [] }
    }
    // 是 video 类型但没取到地址 -> 继续尝试当图文
  }

  // 图文笔记
  const images = (note.imageList || [])
    .map(
      (i) =>
        i.urlDefault ||
        (i.infoList && i.infoList[0] && i.infoList[0].url) ||
        i.url ||
        ''
    )
    .filter(Boolean)
  if (images.length) {
    return { type: 'image', title, author, cover: images[0], videoUrl: '', images }
  }

  throw new Error('已找到小红书笔记，但未取到视频或图片地址')
}

module.exports = { name: 'xiaohongshu', label: '小红书', match, parse }
