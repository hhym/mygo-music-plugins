# 动感酷音乐 · MyGo Music 插件

把 [动感酷音乐](https://www.dgcol.com/) 的每日热歌、近期更新、搜索、在线播放和歌词接进 MyGo Music。

## 安装

1. 解压 `dgcol-plugin-1.0.0.zip`，得到一个包含 `plugin.json`、`index.js`、`locales/`、`README.md` 的文件夹。
2. 在 MyGo Music 的插件设置里选择该文件夹安装，或把文件夹放进应用的插件目录后重启。
3. 插件无需登录，也没有额外设置项。安装后在侧栏可以看到「首页」「每日热歌」「近期更新」「我的喜欢」。

## 功能

- **首页**：抓取每日热歌精选前 10 首，并给出栏目入口。
- **每日热歌**：`/choicemsc/` 列表，10 首一页，支持上一页/下一页。
- **近期更新**：`/newsong/` 新歌榜（站点该页偶发 503，插件会自动重试）。
- **搜索**：按歌名或歌手名请求 `/srct/?kwd=`，结果以歌曲列表返回。
- **单曲播放**：从 `/choicemscdet/<id>` 的 APlayer 配置读取音频地址，按扩展名返回 `ogg/mp3/flac/m4a`。
- **歌词**：读取单曲页 `#songlrc` 的纯文本歌词；原站没有时间轴，插件按时长均匀生成近似 LRC 时间戳。
- **喜欢 / 最近播放**：保存在本机插件 storage，重启后仍在。

## 站点与请求说明

- 站点是 PHP 服务端渲染，前面有 envoy 边缘节点。源站偶发返回固定 91 字节的 503：
  `upstream connect error or disconnect/reset before headers`。插件对网络错误、非 2xx 和 503 最多重试 4 次（约 0.5–0.6 秒退避），仍失败时返回 `unavailable`，不会拖垮首页。
- 页面和封面请求带浏览器 UA 与 `Referer: https://www.dgcol.com/`；音频域名 `*.163music-playerapi.sbs` 已在网络权限与 `requestHeaders` 中声明 Referer。
- 音频是站点 APlayer 里的时效签名 `.ogg` 链接，可能随页面刷新或 CDN 策略失效；`stream` 每次都会重新打开单曲页取新地址。
- 歌单详情页只提供整包下载（`/pgdl/`），没有单曲列表，因此本插件不做「歌单播放」。
- 歌手页、歌单页和近期更新的原始 HTML 结构在开发时多次 503 未能完整核对；搜索页同样未能拿到 200 样本。相关解析使用站点统一的 `song-list-item` 卡片结构，若站点改版或持续 503，这些入口可能显示为空。

## 文件

```
dgcol-plugin/
├── plugin.json
├── index.js
├── locales/zh-CN.json
└── README.md
```

## 许可

插件代码按 MIT 使用；歌曲、封面、歌词版权归动感酷音乐及原权利人所有，请仅作个人试听。
