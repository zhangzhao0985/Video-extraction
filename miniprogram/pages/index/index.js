// 首页：粘贴链接 -> 调用云函数解析 -> 预览/保存
const config = require('../../config')
const { downloadAndSaveVideo, downloadAndSaveImages, transferToCloud } = require('../../utils/util')

Page({
  data: {
    inputText: '',
    loading: false,
    result: null,
    // 图文展示：经云存储中转的临时链接，绕过小红书图片防盗链
    displayImages: [],
    imagesLoading: false,
    // 广告
    showBanner: false,
    bannerAdUnitId: '',
  },

  onLoad() {
    // 显式开启转发 / 朋友圈分享菜单
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
    // Banner 横幅：仅在已正确配置广告位时显示
    if (config.isConfigured(config.bannerAdUnitId)) {
      this.setData({ showBanner: true, bannerAdUnitId: config.bannerAdUnitId })
    }
    // 预创建激励视频广告
    this.initRewardedAd()
  },

  // 转发给朋友 / 群（实现此函数后「···」菜单的转发才可用）
  onShareAppMessage() {
    const r = this.data.result
    return {
      title: r && r.title ? `【${r.platform}】${r.title}` : '视频提取 · 一键提取无水印视频/图片',
      path: '/pages/index/index',
      imageUrl: (r && r.cover) || '',
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return { title: '视频提取 · 一键提取无水印视频/图片' }
  },

  // 初始化激励视频广告（仅在已配置时创建）
  initRewardedAd() {
    this.rewardedAd = null
    this.pendingRewardAction = null
    if (!wx.createRewardedVideoAd || !config.isConfigured(config.rewardedVideoAdUnitId)) {
      return
    }
    const ad = wx.createRewardedVideoAd({ adUnitId: config.rewardedVideoAdUnitId })
    ad.onError((err) => console.error('激励视频广告出错:', err))
    ad.onClose((res) => {
      const action = this.pendingRewardAction
      this.pendingRewardAction = null
      if (res && res.isEnded) {
        if (action) action() // 看完整广告 -> 执行保存
      } else {
        wx.showToast({ title: '看完广告才能保存哦', icon: 'none' })
      }
    })
    this.rewardedAd = ad
  },

  // 先看激励视频再执行 action；未配置或广告加载失败时直接放行
  runWithRewardedAd(action) {
    const ad = this.rewardedAd
    if (!ad) {
      action()
      return
    }
    this.pendingRewardAction = action
    ad.show().catch(() => {
      ad
        .load()
        .then(() => ad.show())
        .catch(() => {
          // 广告基建失败不该惩罚用户，直接放行
          this.pendingRewardAction = null
          action()
        })
    })
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onClear() {
    this.setData({ inputText: '', result: null, displayImages: [], imagesLoading: false })
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
        const isImg = data.type === 'image' && data.images && data.images.length
        this.setData({ result: data, displayImages: [], imagesLoading: !!isImg })
        if (isImg) this.prepareImageDisplay(data.images)
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

  // 图文图片经云存储中转，拿到无防盗链的临时链接用于显示
  async prepareImageDisplay(images) {
    try {
      const fileIDs = await Promise.all(
        images.map((u) => transferToCloud(u, 'image').catch(() => null))
      )
      const valid = fileIDs.filter(Boolean)
      let display = images
      if (valid.length) {
        const { fileList } = await wx.cloud.getTempFileURL({ fileList: valid })
        const map = {}
        fileList.forEach((f) => {
          if (f.tempFileURL) map[f.fileID] = f.tempFileURL
        })
        display = fileIDs.map((id, i) => (id && map[id]) || images[i])
      }
      this.setData({ displayImages: display, imagesLoading: false })
    } catch (e) {
      console.error('图片展示转存失败:', e)
      // 退化：用原始链接（真机可能仍黑屏，但点开可预览）
      this.setData({ displayImages: images, imagesLoading: false })
    }
  },

  // 保存视频到相册（先看激励视频）
  onSaveVideo() {
    if (!(this.data.result && this.data.result.videoUrl)) return
    this.runWithRewardedAd(() => this.doSaveVideo())
  },

  async doSaveVideo() {
    const url = this.data.result.videoUrl
    wx.showLoading({ title: '保存中...', mask: true })
    try {
      await downloadAndSaveVideo(url)
      wx.hideLoading()
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      this.handleSaveError(err)
    }
  },

  // 保存全部图片（先看激励视频）
  onSaveImages() {
    const images = (this.data.result && this.data.result.images) || []
    if (!images.length) return
    this.runWithRewardedAd(() => this.doSaveImages())
  },

  async doSaveImages() {
    const images = this.data.result.images
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

  // 预览图片（优先用中转后的链接，保证大图也能正常显示）
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index
    const urls =
      (this.data.displayImages && this.data.displayImages.length
        ? this.data.displayImages
        : this.data.result && this.data.result.images) || []
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

  // Banner 广告加载失败则隐藏
  onBannerError(e) {
    console.error('Banner 广告出错:', e && e.detail)
    this.setData({ showBanner: false })
  },

  // 统一处理保存失败（区分相册权限 / 其他错误，并显示真实原因）
  handleSaveError(err) {
    console.error(err)
    const msg = (err && (err.errMsg || err.message)) || ''
    if (/auth|permission|deny/i.test(JSON.stringify(err)) || /auth|permission|deny/i.test(msg)) {
      wx.showModal({
        title: '需要相册权限',
        content: '请在设置中允许保存到相册后重试',
        confirmText: '去设置',
        success: (r) => {
          if (r.confirm) wx.openSetting()
        },
      })
    } else {
      // 显示真实错误，便于定位（如云端转存失败/下载失败的具体原因）
      wx.showModal({
        title: '保存失败',
        content: msg || '请重试',
        showCancel: false,
      })
    }
  },
})
