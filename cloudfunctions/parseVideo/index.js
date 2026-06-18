// 云函数入口：接收分享文案/链接，做内容安全检测后返回解析出的视频信息
const cloud = require('wx-server-sdk')
const { extractUrl } = require('./common')
const { pickParser } = require('./parsers')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 文本内容安全检测（微信 msgSecCheck V2，经云调用）
 * @returns {Promise<boolean>} true=安全可放行，false=命中违规
 */
async function isTextSafe(content, openid) {
  const text = (content || '').trim()
  if (!text) return true
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      content: text.slice(0, 2500),
      version: 2,
      scene: 1, // 1=资料
      openid,
    })
    // V2 返回 result.suggest: pass / review / risky
    if (res && res.result && res.result.suggest && res.result.suggest !== 'pass') {
      return false
    }
    return true
  } catch (e) {
    // errCode 87014 = 内容含违规信息
    const code = e && (e.errCode || (e.errMsg && /(\d{5})/.test(e.errMsg) && RegExp.$1))
    if (String(code) === '87014') return false
    // 其它异常（频率限制/网络等）不误伤，放行并记录日志
    console.error('msgSecCheck 异常（放行）:', e && (e.errMsg || e.message))
    return true
  }
}

/**
 * 入参：event.text  用户粘贴的分享文案或纯链接
 * 出参：{ success, data, message }
 *   data: { type, platform, title, author, cover, videoUrl, images, note }
 */
exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const raw = (event.text || event.url || '').trim()
  if (!raw) {
    return { success: false, message: '请先粘贴视频分享链接' }
  }

  // 1. 先对用户输入做内容安全检测
  if (!(await isTextSafe(raw, OPENID))) {
    return { success: false, message: '输入内容包含违规信息，已被拦截' }
  }

  const url = extractUrl(raw)
  if (!url) {
    return { success: false, message: '没有在文案中识别到有效链接' }
  }

  const parser = pickParser(url)
  if (!parser) {
    return {
      success: false,
      message: '暂不支持该平台，目前支持：抖音 / 快手 / 小红书 / B站',
    }
  }

  try {
    const data = await parser.parse(url)

    // 2. 对解析出的标题再做一次内容安全检测
    if (data.title && !(await isTextSafe(data.title, OPENID))) {
      return { success: false, message: '内容包含违规信息，已被拦截' }
    }

    return {
      success: true,
      data: { platform: parser.label, sourceUrl: url, ...data },
    }
  } catch (err) {
    console.error(`[${parser.name}] 解析失败:`, err)
    return {
      success: false,
      platform: parser.label,
      message: `${parser.label}解析失败：${err.message || '未知错误'}`,
    }
  }
}
