// 显示名：听听网（tingting）
// 听听网（www.ttw.cx）MyGo Music 插件
//
// 站点是同步渲染的 PHP 页面，全部内容都会被一层「安全验证」挡住：
// 先 GET 首页拿 csrf_token 与 PHPSESSID，再 POST csrf_token + human_check=on，
// 服务端把「已验证」写进 PHP session（靠 PHPSESSID 认人，有效期约 1 小时）。
// 插件里的 fetch 不会自动存 cookie，所以这里自己从 set-cookie 里抄下来再带回去，
// 撞到验证页就重走一遍验证流程。
//
// 音频：/js/play.php 返回加密过的 url，解不开也无需解 —— 它同时给出 lkid，
// 那就是酷我的 rid，直接用酷我 antiserver 换直链（mp3，206 可 Range）。
// 歌词：/plug/down.php?ac=music&lk=lrc&id=<单曲 id> 直接吐 LRC。

const BASE = "https://www.ttw.cx"
const KUWO = "https://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid="
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const t = (s) => (typeof host !== "undefined" && host.t ? host.t(s) : s)

class PluginError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

/* ---------- 会话验证 ---------- */

let cookie = ""
let sessionLoaded = false

async function loadSession() {
  if (sessionLoaded) return
  sessionLoaded = true
  try {
    if (typeof host !== "undefined" && host.storage) {
      const saved = await host.storage.get("ttw.cookie")
      if (saved && typeof saved === "string") cookie = saved
    }
  } catch (e) {
    /* 读不到就当没有 */
  }
}

async function saveSession() {
  try {
    if (typeof host !== "undefined" && host.storage) await host.storage.set("ttw.cookie", cookie)
  } catch (e) {
    /* 存不下也不影响本次会话 */
  }
}

function absorbCookies(res) {
  let list = []
  try {
    if (res.headers && typeof res.headers.getSetCookie === "function") list = res.headers.getSetCookie()
  } catch (e) {
    list = []
  }
  if (!list || !list.length) return false
  const jar = new Map()
  for (const part of cookie.split(";")) {
    const s = part.trim()
    if (!s) continue
    const i = s.indexOf("=")
    if (i > 0) jar.set(s.slice(0, i), s.slice(i + 1))
  }
  for (const line of list) {
    const pair = String(line).split(";")[0].trim()
    const i = pair.indexOf("=")
    if (i > 0) {
      const name = pair.slice(0, i)
      const value = pair.slice(i + 1)
      if (value === "" || /deleted/i.test(String(line))) jar.delete(name)
      else jar.set(name, value)
    }
  }
  cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
  return true
}

function headers(extra) {
  const h = { "user-agent": UA, referer: BASE + "/", "accept-language": "zh-CN,zh" }
  if (cookie) h.cookie = cookie
  return Object.assign(h, extra || {})
}

function isWall(html) {
  if (!html) return false
  if (html.length > 6000) return false
  return /human_check/.test(html) || /安全验证/.test(html) || /verifyForm/.test(html)
}

async function verify() {
  // 站点有两层：先是一层 cookie 弹跳（403 + JS 重载，第一次会下发一个随机 cookie），
  // 再是「安全验证」页（csrf_token + human_check）。这里把两步连起来做两轮。
  for (let round = 0; round < 2; round++) {
    // 第一步：GET 首页，拿 csrf_token，同时记下服务端发的 cookie
    const r1 = await fetch(BASE + "/", { headers: headers(), redirect: "follow" })
    absorbCookies(r1)
    const page = await r1.text()
    const csrf = (page.match(/name="csrf_token"\s+value="([^"]+)"/) || [])[1]
    if (!csrf && !isWall(page)) {
      await saveSession()
      return true
    }
    if (!csrf) {
      await sleep(400)
      continue
    }
    // 第二步：勾上「我不是机器人」提交
    const body = `csrf_token=${encodeURIComponent(csrf)}&human_check=on`
    const r2 = await fetch(BASE + "/", {
      method: "POST",
      headers: headers({
        "content-type": "application/x-www-form-urlencoded",
        origin: BASE,
        referer: BASE + "/",
      }),
      body,
      redirect: "manual",
    })
    absorbCookies(r2)
    try {
      await r2.text()
    } catch (e) {
      /* 302 没有正文 */
    }
    await saveSession()
    // 第三步：确认真的放行了
    await sleep(300)
    const r3 = await fetch(BASE + "/", { headers: headers(), redirect: "follow" })
    absorbCookies(r3)
    const check = await r3.text()
    if (!isWall(check)) {
      await saveSession()
      return true
    }
    await sleep(600)
  }
  return false
}

// 站点没有会话时会先回一个 403 + JS 弹跳的小页面（顺手 set-cookie），
// 带上新 cookie 再请求一次就正常了，所以这里一律重试而不是直接报错。
function isBounce(html) {
  return !!html && html.length < 800 && /window\.location/.test(html)
}

async function request(url, extraHeaders) {
  await loadSession()
  let lastStatus = 0
  for (let i = 0; i < 4; i++) {
    let res
    let html = ""
    try {
      res = await fetch(url, { headers: headers(extraHeaders), redirect: "follow" })
      lastStatus = res.status
      html = await res.text()
    } catch (e) {
      // 网络层超时/断连：等一会儿再试，别直接把错误抛给用户
      await sleep(400 + i * 600)
      continue
    }
    absorbCookies(res)
    if (res.ok && html && !isWall(html) && !isBounce(html)) return html
    if (isWall(html)) {
      await verify()
      await sleep(400 + i * 500)
      continue
    }
    // 403 弹跳页 / 空 body：等下一步带上新 cookie
    await sleep(250 + i * 400)
  }
  throw new PluginError("response", `听听网返回 ${lastStatus || "超时"}，稍后再试`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ---------- 小工具 ---------- */

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function bigImage(url) {
  let u = String(url || "").trim()
  if (!u) return ""
  u = u
    .replace("/star/albumcover/120/", "/star/albumcover/500/")
    .replace("/star/starheads/300/", "/star/starheads/500/")
    .replace(/size=f\d+_\d+/, "size=f600_600")
  // 站里的图走 http，宿主是本地 http 页面，升级到 https 更稳
  if (u.startsWith("http://") && /kuwo\.cn|baidu\.com|5bb3\.com/.test(u)) u = "https://" + u.slice(7)
  return u
}

function msOf(mmss) {
  const m = /^(\d+):(\d+)$/.exec(String(mmss || "").trim())
  if (!m) return 0
  return (Number(m[1]) * 60 + Number(m[2])) * 1000
}

function splitTitle(title) {
  const s = decodeEntities(title)
  const i = s.indexOf(" - ")
  if (i < 0) return { artist: "", name: s }
  return { artist: s.slice(0, i).trim(), name: s.slice(i + 3).trim() }
}

/* ---------- 页面解析 ---------- */

function parseTracks(html) {
  const out = []
  const seen = new Set()
  const blocks = String(html || "").split("<li")
  for (const b of blocks) {
    if (b.indexOf('href="/t/') < 0) continue
    const href = /href="\/t\/([^"\/]+)\.html"[^>]*?title="([^"]*)"/.exec(b)
    if (!href) continue
    const id = href[1]
    if (seen.has(id)) continue
    seen.add(id)
    const head = splitTitle(href[2])
    const img = (/<img[^>]*src="([^"]+)"/.exec(b) || [])[1] || ""
    const time = (/class="playtime">([\d:]+)/.exec(b) || [])[1] || ""
    const singer = decodeEntities(
      (/class="singer"[^>]*>(?:<span[^>]*>)?([^<]*)</.exec(b) || [])[1] || ""
    )
    const singerId = (/href="\/singer\/([^"\/]+)\.html"[^>]*class="singer"/.exec(b) || [])[1] || ""
    const albumId = (/href="\/album\/([^"\/]+)\.html"/.exec(b) || [])[1] || ""
    out.push({
      id,
      name: head.name,
      artists: [{ id: singerId, name: head.artist || singer }],
      album: { id: albumId, name: "", imageUrl: bigImage(img) },
      duration: msOf(time),
    })
  }
  return out
}

function parseArtistCards(html) {
  const out = []
  const seen = new Set()
  for (const b of String(html || "").split("<li")) {
    const m = /href="\/singer\/([^"\/]+)\.html"[^>]*title="([^"]*)"/.exec(b)
    if (!m || seen.has(m[1])) continue
    seen.add(m[1])
    const img = (/<img[^>]*src="([^"]+)"/.exec(b) || [])[1] || ""
    out.push({ id: m[1], name: decodeEntities(m[2]), imageUrl: bigImage(img) })
  }
  return out
}

function parsePlaylistCards(html) {
  const out = []
  const seen = new Set()
  for (const b of String(html || "").split("<li")) {
    const m = /href="\/playlist\/([^"\/]+)\.html"[^>]*title="([^"]*)"/.exec(b)
    if (!m || seen.has(m[1])) continue
    seen.add(m[1])
    const img = (/<img[^>]*src="([^"]+)"/.exec(b) || [])[1] || ""
    out.push({ id: m[1], name: decodeEntities(m[2]), imageUrl: bigImage(img) })
  }
  return out
}

function parseAlbumCards(html) {
  const out = []
  const seen = new Set()
  for (const b of String(html || "").split("<li")) {
    const m = /href="\/album\/([^"\/]+)\.html"[^>]*title="([^"]*)"/.exec(b)
    if (!m || seen.has(m[1])) continue
    seen.add(m[1])
    const img = (/<img[^>]*src="([^"]+)"/.exec(b) || [])[1] || ""
    out.push({ id: m[1], name: decodeEntities(m[2]), imageUrl: bigImage(img) })
  }
  return out
}

function pageTitle(html, fallback) {
  // 榜单/歌单页真正的标题在列表区的 <div class="title"><h1> 里，
  // 页面最上面的 <h1> 往往是导航（"热门榜单" 之类）
  const at = html.indexOf('class="video_list')
  const zone = at >= 0 ? html.slice(at) : html
  const m = /<h1>([^<]{1,80})<\/h1>/.exec(zone) || /<h1>([^<]{1,80})<\/h1>/.exec(html)
  return decodeEntities(m ? m[1] : fallback || "")
}

// 分页：尾页链接里带最大页码
function lastPage(html, prefix) {
  const re = new RegExp(`href="\\/?${prefix}/(\\d+)\\.html"`, "g")
  let max = 1
  let m
  while ((m = re.exec(html))) max = Math.max(max, Number(m[1]))
  return max
}

function pageOfPath(path) {
  const m = /^(.*?)\/(\d+)\.html$/.exec(String(path || ""))
  if (!m) return { base: path, page: 1 }
  return { base: m[1], page: Number(m[2]) }
}

/* ---------- 首页 / 浏览 ---------- */

const CHARTS = [
  ["top", "音乐飙升榜"],
  ["new", "网络最新榜"],
  ["hot", "网络红歌榜"],
  ["douyin", "抖音热歌榜"],
  ["kuaishou", "快手热歌榜"],
  ["kuwo", "酷我热歌榜"],
  ["ktvtop", "KTV点唱榜"],
  ["djwuqu", "DJ舞曲榜"],
]

function sliceByH1(html, title) {
  const at = html.indexOf(`<h1>${title}</h1>`)
  if (at < 0) return ""
  const next = html.indexOf("<h1>", at + 5)
  return html.slice(at, next > 0 ? next : undefined)
}

export async function home() {
  const html = await request(BASE + "/")
  const sections = []

  const fresh = sliceByH1(html, "新歌排行")
  if (fresh) {
    sections.push({
      title: t("新歌排行"),
      tracks: parseTracks(fresh),
      morePage: "list/new.html",
      pageTitle: t("新歌排行"),
      empty: !parseTracks(fresh).length,
    })
  }

  const playlists = parsePlaylistCards(sliceByH1(html, "推荐歌单"))
  if (playlists.length) {
    sections.push({
      title: t("推荐歌单"),
      playlists: playlists.map((p) => ({
        id: "playlist:" + p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        owner: "听听网",
      })),
      morePage: "playtype/index.html",
      pageTitle: t("推荐歌单"),
    })
  }

  const old = sliceByH1(html, "经典怀旧")
  if (old) {
    sections.push({
      title: t("经典怀旧"),
      tracks: parseTracks(old),
      pageTitle: t("经典怀旧"),
    })
  }

  const singers = parseArtistCards(sliceByH1(html, "推荐歌手"))
  if (singers.length) {
    sections.push({
      title: t("推荐歌手"),
      artists: singers.slice(0, 12),
      morePage: "singerlist/index/index/index/index.html",
      pageTitle: t("推荐歌手"),
    })
  }

  sections.push({
    title: t("排行榜"),
    links: CHARTS.map(([slug, name]) => ({ title: name, page: `list/${slug}.html` })),
    pageTitle: t("排行榜"),
  })

  return {
    title: "听听网",
    subtitle: t("免费 MP3、LRC 歌词"),
    description: t("歌曲来自搜索引擎，站点不存储音频"),
    sections,
  }
}

function tracksSection(title, html, basePath, page) {
  const tracks = parseTracks(html)
  const total = lastPage(html, basePath)
  const more = page < total
  return {
    title,
    sections: [
      {
        title,
        tracks,
        morePage: more ? `${basePath}/${page + 1}.html` : undefined,
        pageTitle: title,
        empty: !tracks.length,
      },
    ],
  }
}

export async function browse({ page }) {
  const raw = String(page || "").trim()
  if (!raw || raw === "home" || raw === "index.html") return home()

  const path = raw.replace(/^\//, "")

  if (path === "charts") {
    return {
      title: t("排行榜"),
      sections: [{ title: t("排行榜"), links: CHARTS.map(([slug, name]) => ({ title: name, page: `list/${slug}.html` })) }],
    }
  }

  if (path.startsWith("list/")) {
    const { base, page: n } = pageOfPath(path)
    const slug = base.replace(/^list\//, "").replace(/\.html$/, "")
    const label = (CHARTS.find(([s]) => s === slug) || [])[1] || t("排行榜")
    const html = await request(`${BASE}/${base}${n > 1 ? "/" + n : ""}.html`)
    let title = pageTitle(html, label)
    // 榜单页的 h1 常是一长串 SEO 文案，太长就用导航里的榜名
    if (!title || title.length > 24) title = label
    return tracksSection(title, html, base.replace(/\.html$/, ""), n)
  }

  if (path.startsWith("singerlist")) {
    const html = await request(`${BASE}/${path}`)
    const artists = parseArtistCards(html)
    return {
      title: t("推荐歌手"),
      sections: [{ title: t("推荐歌手"), artists, pageTitle: t("推荐歌手"), empty: !artists.length }],
    }
  }

  if (path.startsWith("playtype") || path.startsWith("playlist")) {
    const html = await request(`${BASE}/${path}`)
    const cards = parsePlaylistCards(html)
    const single = path.startsWith("playlist")
    if (single) {
      const meta = playlistMeta(html, path.replace(/^playlist\//, "").replace(/\.html$/, ""))
      const tracks = parseTracks(html)
      return {
        title: meta.name,
        subtitle: meta.description,
        imageUrl: meta.imageUrl,
        sections: [{ title: meta.name, tracks, pageTitle: meta.name, empty: !tracks.length }],
      }
    }
    return {
      title: t("歌单"),
      sections: [
        {
          title: t("歌单"),
          playlists: cards.map((p) => ({
            id: "playlist:" + p.id,
            name: p.name,
            imageUrl: p.imageUrl,
            owner: "听听网",
          })),
          pageTitle: t("歌单"),
          empty: !cards.length,
        },
      ],
    }
  }

  if (path.startsWith("albumlist")) {
    const html = await request(`${BASE}/${path}`)
    const albums = parseAlbumCards(html)
    return {
      title: t("新碟"),
      sections: [{ title: t("新碟"), albums, pageTitle: t("新碟"), empty: !albums.length }],
    }
  }

  if (path.startsWith("singer/")) {
    const { base, page: n } = pageOfPath(path)
    const html = await request(`${BASE}/${base}${n > 1 ? "/" + n : ""}.html`)
    const meta = singerMeta(html, base.replace(/^singer\//, ""))
    return {
      title: meta.name,
      subtitle: meta.description,
      imageUrl: meta.imageUrl,
      sections: [
        {
          title: meta.name,
          tracks: parseTracks(html),
          pageTitle: meta.name,
          morePage: n < lastPage(html, base) ? `${base}/${n + 1}.html` : undefined,
        },
      ],
    }
  }

  if (path.startsWith("album/")) {
    const { base } = pageOfPath(path)
    const html = await request(`${BASE}/${base}.html`)
    const meta = albumMeta(html)
    return {
      title: meta.name,
      imageUrl: meta.imageUrl,
      sections: [{ title: meta.name, tracks: parseTracks(html), pageTitle: meta.name }],
    }
  }

  throw new PluginError("unsupported", t("没有这一页"))
}

/* ---------- 搜索 ---------- */

function searchUrl(query, page) {
  const enc = encodeURIComponent(query)
  return page <= 1 ? `${BASE}/so/${enc}.html` : `${BASE}/so/${enc}/${page}.html`
}

export async function search({ query, kind, offset }) {
  const q = String(query || "").trim()
  if (!q) throw new PluginError("unsupported", t("请输入关键词"))
  const page = Math.floor((Number(offset) || 0) / 50) + 1
  const html = await request(searchUrl(q, page))
  const more = page < lastPage(html, `/so/${encodeURIComponent(q)}`)

  if (!kind || kind === "tracks") return { tracks: parseTracks(html), more }

  if (kind === "artists") {
    // 搜索结果里歌手是 <a href="/singer/…" class="singer">名字</a>
    const out = []
    const seen = new Set()
    const re = /href="\/singer\/([^"\/]+)\.html"[^>]*class="singer"[^>]*>(?:<span[^>]*>)?([^<]*)</g
    let m
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue
      seen.add(m[1])
      out.push({ id: m[1], name: decodeEntities(m[2]) })
    }
    return { artists: out.slice(0, 20), more: false }
  }
  if (kind === "playlists") {
    const playlists = parsePlaylistCards(html).map((p) => ({
      id: "playlist:" + p.id,
      name: p.name,
      imageUrl: p.imageUrl,
    }))
    return { playlists, more: false }
  }
  if (kind === "albums") return { albums: parseAlbumCards(html), more: false }
  return { [kind]: [], more: false }
}

/* ---------- 歌手 / 专辑 / 歌单 ---------- */

function singerMeta(html, id) {
  const at = html.indexOf('class="singer_info"')
  const block = at >= 0 ? html.slice(at) : html
  const name = decodeEntities((/<h1>([^<]*)<\/h1>/.exec(block) || [])[1] || "")
  const image = bigImage((/<img[^>]*src="([^"]+)"/.exec(block) || [])[1] || "")
  const info = decodeEntities((/<div class="info">[\s\S]{0,40}?<p[^>]*>([\s\S]*?)<\/p>/.exec(block) || [])[1] || "")
  return { id: String(id || ""), name, imageUrl: image, description: info.replace(/<[^>]+>/g, "") }
}

function albumMeta(html) {
  const i = html.indexOf('class="singer_info"')
  const block = i >= 0 ? html.slice(i) : html
  const name = decodeEntities((/<h1>([^<]*)<\/h1>/.exec(block) || [])[1] || "")
  const image = bigImage((/<img[^>]*src="([^"]+)"/.exec(block) || [])[1] || "")
  const info = decodeEntities((/<div class="info">[\s\S]{0,40}?<p[^>]*>([\s\S]*?)<\/p>/.exec(block) || [])[1] || "")
  const artist = decodeEntities((/href="\/singer\/([^"\/]+)\.html"[^>]*>([^<]*)</.exec(block) || [])[2] || "")
  const released = (/发行时间：<span>([^<]*)<\/span>/.exec(html) || [])[1] || ""
  return {
    name,
    imageUrl: image,
    description: info.replace(/<[^>]+>/g, "").trim(),
    artist: artist,
    released,
  }
}

function playlistMeta(html, id) {
  const i = html.indexOf('class="singer_info"')
  const block = i >= 0 ? html.slice(i) : html
  const name = decodeEntities((/<h1>([^<]*)<\/h1>/.exec(block) || [])[1] || "")
  const image = bigImage((/<img[^>]*src="([^"]+)"/.exec(block) || [])[1] || "")
  const info = decodeEntities((/<div class="info">([\s\S]*?)<\/div>/.exec(block) || [])[1] || "")
  const count = Number((/共有<span>(\d+)<\/span>/.exec(html) || [])[1] || 0)
  return {
    id: "playlist:" + String(id || ""),
    name,
    imageUrl: image,
    description: info.replace(/<[^>]+>/g, "").trim(),
    trackCount: count,
  }
}

export async function artist({ id }) {
  const html = await request(`${BASE}/singer/${encodeURIComponent(id)}.html`)
  const meta = singerMeta(html, id)
  if (!meta.name) throw new PluginError("unavailable", t("这位歌手在听听网上找不到了"))
  const tracks = parseTracks(html)
  return {
    artist: { id: String(id), name: meta.name, imageUrl: meta.imageUrl },
    tracks,
    albums: [],
  }
}

export async function album({ id }) {
  const raw = String(id || "")
  const pid = raw.replace(/^playlist:/, "")
  const isPlaylist = raw.startsWith("playlist:") || raw.startsWith("playlist/")
  const clean = pid.replace(/^playlist\//, "").replace(/\.html$/, "")
  if (isPlaylist) {
    const html = await request(`${BASE}/playlist/${encodeURIComponent(clean)}.html`)
    const meta = playlistMeta(html, clean)
    if (!meta.name) throw new PluginError("unavailable", t("这个歌单在听听网上找不到了"))
    return {
      album: {
        id: "playlist:" + clean,
        name: meta.name,
        imageUrl: meta.imageUrl,
        description: meta.description,
        artists: [{ name: "听听网" }],
      },
      tracks: parseTracks(html),
    }
  }
  const html = await request(`${BASE}/album/${encodeURIComponent(clean)}.html`)
  const meta = albumMeta(html)
  if (!meta.name) throw new PluginError("unavailable", t("这张专辑在听听网上找不到了"))
  return {
    album: {
      id: clean,
      name: meta.name,
      imageUrl: meta.imageUrl,
      description: meta.description,
      artists: meta.artist ? [{ name: meta.artist }] : [],
      released: meta.released,
    },
    tracks: parseTracks(html),
  }
}

export async function playlist({ id }) {
  const raw = String(id || "")
  const clean = raw.replace(/^playlist:/, "").replace(/^playlist\//, "").replace(/\.html$/, "")
  const html = await request(`${BASE}/playlist/${encodeURIComponent(clean)}.html`)
  const meta = playlistMeta(html, clean)
  if (!meta.name) throw new PluginError("unavailable", t("这个歌单在听听网上找不到了"))
  const tracks = parseTracks(html)

  return {
    id: meta.id,
    name: meta.name,
    imageUrl: meta.imageUrl,
    description: meta.description,
    owner: "听听网",
    trackCount: meta.trackCount || tracks.length,
    tracks,
  }
}

/* ---------- 歌词 / 播放 ---------- */

export async function lyrics({ id }) {
  await loadSession()
  const url = `${BASE}/plug/down.php?ac=music&lk=lrc&id=${encodeURIComponent(id)}`
  const res = await fetch(url, { headers: headers(), redirect: "follow" })
  if (!res.ok) throw new PluginError("response", `听听网返回 ${res.status}`)
  const text = await res.text()
    if (isWall(text)) throw new PluginError("response", t("听听网的人机验证没过去，稍后再试"))
  const lrc = text
    .split(/\r?\n/)
    .filter((line) => !/^\[[^\]]*\].*欢迎来访听听网/.test(line.trim()))
    .join("\n")
    .trim()
  if (!lrc) throw new PluginError("unavailable", t("这首歌没有歌词"))
  return { lrc }
}

export async function stream({ id, quality }) {
  await loadSession()
  const body = `id=${encodeURIComponent(id)}&type=music`
  const res = await fetch(`${BASE}/js/play.php`, {
    method: "POST",
    headers: headers({
      "content-type": "application/x-www-form-urlencoded",
      referer: `${BASE}/t/${encodeURIComponent(id)}.html`,
    }),
    body,
  })
  let data = null
  try {
    data = await res.json()
  } catch (e) {
    data = null
  }
  if (!data || Number(data.msg) !== 1 || !data.lkid) {
    throw new PluginError("unavailable", t("这首歌在听听网上没有试听地址"))
  }
  const rid = "MUSIC_" + String(data.lkid)
  const url = await kuwoUrl(rid)
  if (!url) throw new PluginError("unavailable", t("酷我没有给出这首歌的播放地址"))
  return { url, type: "mp3", quality }
}

async function kuwoUrl(rid) {
  try {
    const res = await fetch(KUWO + encodeURIComponent(rid), { headers: { "user-agent": UA } })
    const text = (await res.text()).trim()
    if (text.startsWith("http")) return text
  } catch (e) {
    /* 下面再试一次 */
  }
  try {
    const res = await fetch(`http://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=${encodeURIComponent(rid)}`, {
      headers: { "user-agent": UA },
    })
    const text = (await res.text()).trim()
    if (text.startsWith("http")) return text
  } catch (e) {
    /* 放弃 */
  }
  return ""
}

/* ---------- 榜单（stations 形式） ---------- */

export async function stations() {
  const thumb = ""
  return CHARTS.map(([slug, name]) => ({
    id: `list:${slug}`,
    name,
    description: t("听听网排行榜，持续播放"),
    imageUrl: thumb,
  }))
}

const served = new Set()

export async function stationNext({ id }) {
  const m = /^list:([a-z]+)$/.exec(String(id || ""))
  if (!m) throw new PluginError("unsupported", t("不支持的榜单"))
  if (served.has(id)) return []
  served.add(id)
  const html = await request(`${BASE}/list/${m[1]}.html`)
  return parseTracks(html)
}

export async function suggest({ query }) {
  const q = String(query || "").trim()
  if (!q) return []
  try {
    const html = await request(searchUrl(q, 1))
    return parseTracks(html).slice(0, 8).map((x) => x.name)
  } catch (e) {
    return []
  }
}
