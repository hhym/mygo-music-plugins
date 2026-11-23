# 糖豆音乐 插件

站点：https://www.tangdou.com/music/

按 MyGo Music 插件规范实现，支持首页、分类分页、搜索、单曲详情、播放、喜欢与历史。

- 数据接口：`api-h5.tangdou.com`
- 首页：舞曲推荐、新歌速递各 30 首
- 分类：`/pc/music/list` 的 `type=1` 舞曲推荐、`type=2` 新歌速递，`pagesize=30`
- 详情：`/pc/music/play?id=<id>`，返回歌名、作者、封面、歌词与 `play_url`
- 播放：`play_url` 为 `mp3qiniu.tangdou.com` 的 MP3 直链
- 搜索：并发遍历两类列表前 7 页，按歌名/作者本地匹配（站点没有公开搜索接口）
- 封面：相对路径补 `https://aimg.tangdou.com`
