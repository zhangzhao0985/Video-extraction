// 云函数入口：接收分享文案/链接，返回解析出的视频信息
const cloud = require('wx-server-sdk')
const { extractUrl } = require('./common')
const { pickParser } = require('./parsers')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 入参：event.text  用户粘贴的分享文案或纯链接
 * 出参：{ success, data, message }
 *   data: { type, platform, title, author, cover, videoUrl, images, note }
 */
exports.main = async (event = {}) => {
  const raw = (event.text || event.url || '').trim()
  if (!raw) {
    return { success: false, message: '请先粘贴视频分享链接' }
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
