# 视频提取小程序

一个基于「微信小程序 + 云开发」的短视频提取工具：用户把分享链接粘贴进小程序，
即可解析出**无水印视频**并在线预览、保存到相册。支持 **抖音 / 快手 / 小红书 / B站**。

> ⚠️ 本项目仅供学习与个人备份使用，请勿用于商业用途或侵犯他人版权。
> 「去水印/搬运」类小程序在微信审核中可能不通过，上线前请确认合规。

---

## ✨ 功能

- 📋 粘贴分享链接 / 文案，自动识别其中的 URL 和平台
- 🎬 抖音、快手解析无水印视频
- 📕 小红书支持视频笔记与图文笔记（多图）
- 📺 B站通过官方接口解析（视频地址需带 Referer，建议云端转存）
- 💾 一键保存视频 / 图片到系统相册
- 🔗 复制视频直链
- 🧩 解析器采用「注册表 + 单平台模块」结构，新增平台只需加一个文件

---

## 🗂 目录结构

```
.
├── miniprogram/                 # 小程序前端
│   ├── app.js / app.json / app.wxss
│   ├── sitemap.json
│   ├── pages/index/             # 主页面（粘贴/提取/预览/保存）
│   └── utils/util.js            # 下载 & 保存相册封装
├── cloudfunctions/
│   ├── transferMedia/          # 媒体转存云函数（下载视频/图片→云存储→返回 fileID）
│   └── parseVideo/              # 解析云函数
│       ├── index.js             # 入口：分发到对应解析器
│       ├── common.js            # 网络请求 / UA / 短链还原 / 链接提取
│       └── parsers/             # 各平台解析器
│           ├── index.js         # 解析器注册表
│           ├── douyin.js
│           ├── kuaishou.js
│           ├── xiaohongshu.js
│           └── bilibili.js
├── project.config.json
└── README.md
```

---

## 🚀 部署步骤

### 1. 准备工作
- 注册一个**小程序账号**并拿到 **AppID**：<https://mp.weixin.qq.com>
- 安装**微信开发者工具**：<https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html>

### 2. 导入项目
1. 打开微信开发者工具 → 导入项目，目录选择本仓库根目录。
2. 把 `project.config.json` 里的 `appid` 改成你自己的 AppID。

### 3. 开通云开发
1. 工具顶部点击「云开发」按钮，按引导**开通云开发**（新用户有免费额度）。
2. 记下你的**云环境 ID**。`app.js` 默认使用 `DYNAMIC_CURRENT_ENV`
   会自动选当前环境；如有多个环境，可改成具体的环境 ID。

### 4. 部署云函数（两个都要部署）
1. 右键 `cloudfunctions/parseVideo` → **「上传并部署：云端安装依赖」**。
   - 部署后在云开发控制台把该函数**超时时间调到 20 秒**（解析要多次请求外部站点）。
2. 右键 `cloudfunctions/transferMedia` → **「上传并部署：云端安装依赖」**。
   - 部署后在控制台把该函数**超时调到 60 秒、内存调到 512MB**（要下载整段视频再转存）。

> `transferMedia` 负责「保存到相册」：真机上 `wx.downloadFile` 受 downloadFile
> 合法域名白名单限制，而视频域名是动态的、加不全；改为云函数下载转存到云存储后，
> 前端用 `wx.cloud.downloadFile(fileID)` 下载就不受白名单限制了。

### 5. 检查云存储读权限
云开发控制台 → **存储 → 权限设置**，确保是「**所有用户可读，仅创建者可写**」
（新环境默认就是）。否则前端按 fileID 下载会被拒。

### 6. 运行
- 编译预览，把任意一条分享链接粘进去点「开始提取」即可。
- 「保存到相册」走的是云存储中转，**真机/体验版**也能正常保存。

---

## 🔧 如何新增一个平台

1. 在 `cloudfunctions/parseVideo/parsers/` 下新建 `xxx.js`：

   ```js
   const { httpGet, resolveRedirect, UA } = require('../common')
   const match = (url) => /xxx\.com/.test(url)
   async function parse(url) {
     // ... 返回统一结构
     return { type: 'video', title, author, cover, videoUrl, images: [] }
   }
   module.exports = { name: 'xxx', label: '某平台', match, parse }
   ```

2. 在 `parsers/index.js` 里 `require` 并加入 `parsers` 数组。

解析器统一返回结构：

| 字段       | 说明                                  |
| ---------- | ------------------------------------- |
| `type`     | `'video'` 或 `'image'`                |
| `title`    | 标题/文案                             |
| `author`   | 作者昵称                              |
| `cover`    | 封面图                                |
| `videoUrl` | 无水印视频直链（图文为空）            |
| `images`   | 图片直链数组（视频为空）              |
| `note`     | 可选，给前端的额外提示                |

---

## ⚠️ 注意事项

- **解析规则会失效**：各平台会不定期改版页面结构 / 接口，解析器属于「尽力而为」，
  失效时需要按上面的结构更新对应 `parsers/xxx.js`。
- **保存到相册 = 云存储中转**：已通过 `transferMedia` 云函数解决真机保存问题，
  无需再配置 downloadFile 合法域名。代价是会占用云存储/下行流量配额，可定期
  在控制台清理 `extract/` 目录下的临时文件。
- **B站直链**需要携带 `Referer`，预览（`<video>`）在真机上可能放不出来，但
  `transferMedia` 下载时会自动带上 Referer，所以**保存功能不受影响**。
- **合规**：上线前请阅读微信小程序运营规范，避免因「内容搬运 / 去水印」类目被驳回。
- **预览域名**：`<video>` 在线预览用的是平台直链；开发阶段可在工具「详情 → 本地设置」
  勾选「不校验合法域名」。保存功能已走云存储，不依赖该白名单。

---

## 📄 License

MIT
