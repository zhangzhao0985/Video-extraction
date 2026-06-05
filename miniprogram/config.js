// 广告位配置
// 开通微信「流量主」后，在「流量主后台 → 广告位」新建广告位，把下面的占位 ID
// 换成你的真实广告位 ID（形如 adunit-xxxxxxxxxxxx）。
// 只要还是占位值，对应广告会自动关闭，不影响小程序功能。
const config = {
  // 激励视频广告位 ID（点“保存”时先看一段广告）
  rewardedVideoAdUnitId: 'adunit-请替换为你的激励视频广告位ID',
  // Banner 横幅广告位 ID（首页底部常驻）
  bannerAdUnitId: 'adunit-请替换为你的Banner广告位ID',
}

// 判断某个广告位是否已正确填写（排除占位值）
config.isConfigured = (id) =>
  typeof id === 'string' && id.indexOf('adunit-') === 0 && !/请替换/.test(id)

module.exports = config
