// 通用工具方法：网络请求、UA、链接提取、短链解析
const axios = require('axios')

// 常用 User-Agent
const UA = {
  // 移动端 UA，很多分享页只对移动端返回完整数据
  mobile:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  // 桌面端 UA
  pc:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

// 默认请求超时（毫秒）
const TIMEOUT = 12000

/**
 * 发起 GET 请求，自动跟随重定向
 * @param {string} url
 * @param {object} options { ua, headers, responseType }
 */
async function httpGet(url, options = {}) {
  const { ua = UA.mobile, headers = {}, responseType = 'text' } = options
  const res = await axios.get(url, {
    timeout: TIMEOUT,
    responseType,
    maxRedirects: 5,
    headers: {
      'User-Agent': ua,
      'Accept': '*/*',
      ...headers,
    },
    validateStatus: (s) => s >= 200 && s < 400,
  })
  return res
}

/**
 * 解析短链 / 跟随跳转，返回最终落地的真实地址
 * @param {string} url
 */
async function resolveRedirect(url, options = {}) {
  const res = await httpGet(url, options)
  // axios(node) 会把最终地址放在 request.res.responseUrl
  const finalUrl =
    (res.request && res.request.res && res.request.res.responseUrl) ||
    (res.request && res.request.responseURL) ||
    url
  return { finalUrl, res }
}

/**
 * 从一段分享文案中提取出第一个 http(s) 链接
 * 例如抖音分享文案：「7.66 xxx# 在抖音，记录美好生活 https://v.douyin.com/xxx/ 复制此链接...」
 * @param {string} text
 */
function extractUrl(text) {
  if (!text) return null
  const m = String(text).match(/https?:\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;()*\[\]]+/)
  return m ? m[0].replace(/[.,，。、)\]]+$/, '') : null
}

module.exports = { axios, UA, TIMEOUT, httpGet, resolveRedirect, extractUrl }
