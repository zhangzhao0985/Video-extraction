// 下载/转存 + 保存到相册
// 真机上 wx.downloadFile 受“downloadFile 合法域名”白名单限制，而抖音等视频
// 域名是动态变化的、无法逐个加白名单。因此改为：云函数把媒体转存到云存储，
// 前端用 wx.cloud.downloadFile 按 fileID 下载（不受合法域名限制），再存相册。

// 调用云函数把远程媒体转存到云存储，返回 fileID
function transferToCloud(url, type) {
  return wx.cloud
    .callFunction({ name: 'transferMedia', data: { url, type } })
    .then((res) => {
      const r = (res && res.result) || {}
      if (!r.success || !r.fileID) {
        throw new Error(r.message || '云端转存失败')
      }
      return r.fileID
    })
}

// 用 fileID 从云存储下载到本地临时文件
function downloadFromCloud(fileID) {
  return wx.cloud.downloadFile({ fileID }).then((res) => {
    if (!res.tempFilePath) throw new Error('云存储下载失败')
    return res.tempFilePath
  })
}

// 保存视频到相册（经云存储中转）
async function downloadAndSaveVideo(url) {
  const fileID = await transferToCloud(url, 'video')
  const tempPath = await downloadFromCloud(fileID)
  return new Promise((resolve, reject) => {
    wx.saveVideoToPhotosAlbum({ filePath: tempPath, success: resolve, fail: reject })
  })
}

// 保存单张图片到相册（经云存储中转）
async function downloadAndSaveImage(url) {
  const fileID = await transferToCloud(url, 'image')
  const tempPath = await downloadFromCloud(fileID)
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({ filePath: tempPath, success: resolve, fail: reject })
  })
}

// 顺序保存多张图片（避免并发触发频控）
async function downloadAndSaveImages(urls) {
  for (const url of urls) {
    await downloadAndSaveImage(url)
  }
}

module.exports = {
  transferToCloud,
  downloadFromCloud,
  downloadAndSaveVideo,
  downloadAndSaveImage,
  downloadAndSaveImages,
}
