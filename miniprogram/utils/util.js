// 下载 + 保存到相册的封装（均返回 Promise）

// 下载单个文件，返回本地临时路径
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error('下载失败，状态码 ' + res.statusCode))
        }
      },
      fail: reject,
    })
  })
}

// 下载视频并保存到系统相册
function downloadAndSaveVideo(url) {
  return downloadFile(url).then(
    (tempPath) =>
      new Promise((resolve, reject) => {
        wx.saveVideoToPhotosAlbum({
          filePath: tempPath,
          success: resolve,
          fail: reject,
        })
      })
  )
}

// 保存单张图片
function downloadAndSaveImage(url) {
  return downloadFile(url).then(
    (tempPath) =>
      new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: tempPath,
          success: resolve,
          fail: reject,
        })
      })
  )
}

// 顺序保存多张图片（避免并发触发频控）
async function downloadAndSaveImages(urls) {
  for (const url of urls) {
    await downloadAndSaveImage(url)
  }
}

module.exports = {
  downloadFile,
  downloadAndSaveVideo,
  downloadAndSaveImage,
  downloadAndSaveImages,
}
