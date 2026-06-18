// 媒体转存云函数：把远程视频/图片下载下来，转存到云存储，返回 fileID
// 目的：真机上 wx.downloadFile 受“downloadFile 合法域名”白名单限制，
// 而抖音等视频域名是动态变化的，无法逐个加白名单；改用云存储中转后，
// 前端用 wx.cloud.downloadFile(fileID) 下载不受该限制。
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 根据媒体地址推断需要携带的请求头（部分站点要求 Referer 才能下载）
function headersFor(url) {
  const ua =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  const h = { 'User-Agent': ua }
  if (/bili(video|bili)|akamaized|\.mcdn\.|hdslb/.test(url)) {
    h.Referer = 'https://www.bilibili.com'
  } else if (/douyin|snssdk|byteimg|douyinvod|amemv/.test(url)) {
    h.Referer = 'https://www.douyin.com/'
  } else if (/kuaishou|gifshow|yximgs/.test(url)) {
    h.Referer = 'https://www.kuaishou.com/'
  } else if (/xhscdn|xiaohongshu|sns-/.test(url)) {
    h.Referer = 'https://www.xiaohongshu.com/'
  }
  return h
}

/**
 * 入参：
 *   event.url   远程媒体直链
 *   event.type  'video' | 'image'（决定云存储里的扩展名）
 * 出参：{ success, fileID, size, message }
 */
exports.main = async (event = {}) => {
  const { url, type = 'video' } = event
  if (!url) return { success: false, message: '缺少 url 参数' }

  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 50000,
      maxRedirects: 5,
      headers: headersFor(url),
      maxContentLength: 120 * 1024 * 1024,
      maxBodyLength: 120 * 1024 * 1024,
      validateStatus: (s) => s >= 200 && s < 400,
    })

    const buf = Buffer.from(resp.data)
    if (!buf.length) return { success: false, message: '下载到的内容为空' }

    const ext = type === 'image' ? 'jpg' : 'mp4'
    const cloudPath = `extract/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`
    const up = await cloud.uploadFile({ cloudPath, fileContent: buf })

    // 记录到 media_temp 集合，供定时清理函数按时间删除（失败不影响转存）
    try {
      await cloud
        .database()
        .collection('media_temp')
        .add({ data: { fileID: up.fileID, createTime: Date.now() } })
    } catch (e) {
      console.error('记录 media_temp 失败（不影响转存）:', e && e.message)
    }

    return { success: true, fileID: up.fileID, size: buf.length }
  } catch (e) {
    console.error('transferMedia error:', e)
    return { success: false, message: (e && e.message) || '转存失败' }
  }
}
