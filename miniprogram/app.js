// 小程序入口：初始化云开发环境
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 及以上版本')
      return
    }
    wx.cloud.init({
      // DYNAMIC_CURRENT_ENV 会自动使用当前小程序绑定的云环境，
      // 也可以改成你自己的环境 ID，例如 'video-xxxx'
      env: wx.cloud.DYNAMIC_CURRENT_ENV,
      traceUser: true,
    })
  },
  globalData: {},
})
