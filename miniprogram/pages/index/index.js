// 首页：粘贴链接 -> 调用云函数解析 -> 预览/保存
const { downloadAndSaveVideo, downloadAndSaveImages } = require('../../utils/util')

Page({
  data: {
    inputText: '',
    loading: false,
    result: null,
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onClear() {
    this.setData({ inputText: '', result: null })
  },

  // 读取剪贴板
  onPaste() {
    wx.getClipboardData({
      success: (res) => {
        if (res.data) {
          this.setData({ inputText: res.data })
          wx.showToast({ title: '已粘贴', icon: 'none' })
        } else {
          wx.showToast({ title: '剪贴板为空', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '读取剪贴板失败', icon: 'none' }),
    })
  },

  // 调用云函数解析
  async onExtract() {
    const text = (this.data.inputText || '').trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴链接', icon: 'none' })
      return
    }
    this.setData({ loading: true, result: null })
    wx.showLoading({ title: '正在解析...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'parseVideo',
        data: { text },
      })
      const { success, data, message } = res.result || {}
      if (success && data) {
        this.setData({ result: data })
      } else {
        wx.showModal({
          title: '解析失败',
          content: message || '未能解析该链接',
          showCancel: false,
        })
      }
    } catch (err) {
      console.error(err)
      wx.showModal({
        title: '调用失败',
        content: '云函数调用失败，请检查云开发环境是否已部署 parseVideo。',
        showCancel: false,
      })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  // 保存视频到相册
  async onSaveVideo() {
    const url = this.data.result && this.data.result.videoUrl
    if (!url) return
    wx.showLoading({ title: '下载中...', mask: true })
    try {
      await downloadAndSaveVideo(url)
      wx.hideLoading()
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      this.handleSaveError(err)
    }
  },

  // 保存全部图片
  async onSaveImages() {
    const images = (this.data.result && this.data.result.images) || []
    if (!images.length) return
    wx.showLoading({ title: '保存图片中...', mask: true })
    try {
      await downloadAndSaveImages(images)
      wx.hideLoading()
      wx.showToast({ title: '图片已保存', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      this.handleSaveError(err)
    }
  },

  // 预览图片
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index
    const urls = (this.data.result && this.data.result.images) || []
    wx.previewImage({ current: urls[index], urls })
  },

  // 复制视频直链
  onCopyUrl() {
    const url =
      (this.data.result && this.data.result.videoUrl) ||
      (this.data.result && this.data.result.images && this.data.result.images[0])
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '直链已复制', icon: 'none' }),
    })
  },

  // 统一处理保存失败（多为相册权限被拒）
  handleSaveError(err) {
    console.error(err)
    if (err && /auth|permission|deny/i.test(JSON.stringify(err))) {
      wx.showModal({
        title: '需要相册权限',
        content: '请在设置中允许保存到相册后重试',
        confirmText: '去设置',
        success: (r) => {
          if (r.confirm) wx.openSetting()
        },
      })
    } else {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },
})
