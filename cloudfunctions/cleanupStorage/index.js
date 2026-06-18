// 定时清理云函数：删除 2 小时前转存到云存储的临时文件，控制存储成本
// 由定时触发器（每小时）自动调用，见 config.json
// 注意：只删 2 小时前的文件，用户下载都是秒级完成，绝不会影响正在使用的文件。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 保留时长（毫秒）：2 小时前的转存文件才清理
const KEEP_MS = 2 * 60 * 60 * 1000

exports.main = async () => {
  const cutoff = Date.now() - KEEP_MS
  try {
    // 取出过期记录（每次最多 100 条，余下的下次再清）
    const res = await db
      .collection('media_temp')
      .where({ createTime: _.lt(cutoff) })
      .limit(100)
      .get()
    const records = res.data || []
    if (!records.length) return { success: true, deleted: 0 }

    // 先删云存储文件（每次最多 50 个）
    const fileIDs = records.map((r) => r.fileID).filter(Boolean)
    for (let i = 0; i < fileIDs.length; i += 50) {
      try {
        await cloud.deleteFile({ fileList: fileIDs.slice(i, i + 50) })
      } catch (e) {
        console.error('deleteFile 部分失败（继续）:', e && e.message)
      }
    }

    // 再删对应的数据库记录
    const ids = records.map((r) => r._id)
    await db.collection('media_temp').where({ _id: _.in(ids) }).remove()

    return { success: true, deleted: records.length }
  } catch (e) {
    console.error('cleanupStorage error:', e)
    return { success: false, message: (e && e.message) || '清理失败' }
  }
}
