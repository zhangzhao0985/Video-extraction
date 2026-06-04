// 解析器注册表：新增平台只需在此处 require 并加入数组
const douyin = require('./douyin')
const kuaishou = require('./kuaishou')
const xiaohongshu = require('./xiaohongshu')
const bilibili = require('./bilibili')

const parsers = [douyin, kuaishou, xiaohongshu, bilibili]

/**
 * 根据 url 选择匹配的解析器
 * @param {string} url
 * @returns 解析器对象或 null
 */
function pickParser(url) {
  return parsers.find((p) => p.match(url)) || null
}

module.exports = { parsers, pickParser }
