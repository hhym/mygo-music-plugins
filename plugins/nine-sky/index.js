// 九天音乐（9sky.com）插件
// 站点是老的 server-rendered 页面：搜索走 new.9sky.com 的 h5 接口，单曲信息与音频地址
// 藏在 /music?ids= 返回的 `var lists = formatSong([...])` 里，唱片页是 `var list = [...]`。

const WEB = "http://www.9sky.com"
const SEARCH_API = "http://new.9sky.com/api/h5/web/music/search"
const MEDIA = "http://sp.9sky.com"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const t = (s) => (typeof host !== "undefined" && host.t ? host.t(s) : s)

class PluginError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

async function getText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, referer: WEB + "/" } })
  if (!res.ok) throw new PluginError("response", `九天音乐返回 ${res.status}`)
  return res.text()
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, referer: WEB + "/" } })
  if (!res.ok) throw new PluginError("response", `九天音乐返回 ${res.status}`)
  return res.json()
}

/* ---------- 解析 ---------- */

function unescapeJS(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
}

// 把 `[{...},{...}]` 这种 JS 字面量拆成对象数组（不带引号的值也认）
function splitObjects(body) {
  const out = []
  let depth = 0
  let start = -1
  let quote = ""
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quote) {
      if (ch === "\\") i++
      else if (ch === quote) quote = ""
      continue
    }
    if (ch === "'" || ch === '"') { quote = ch; continue }
    if (ch === "{") {
      if (depth === 0) start = i
      depth++
    } else if (ch === "}") {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(body.slice(start, i + 1))
        start = -1
      }
    }
  }
  return out
}

function fields(obj) {
  const map = {}
  // 键可能带引号（'songUrl':），值可能是 '...' / "..." / 数字 / null
  const re = /(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"|([A-Za-z_][A-Za-z0-9_]*))\s*:\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"|(null|true|false|-?\d+(?:\.\d+)?))/g
  let m
  while ((m = re.exec(obj))) {
    const key = m[1] !== undefined ? unescapeJS(m[1]) : m[2] !== undefined ? unescapeJS(m[2]) : m[3]
    const val = m[4] !== undefined ? unescapeJS(m[4]) : m[5] !== undefined ? unescapeJS(m[5]) : m[6]
    map[key] = val === "null" ? null : val === "true" ? true : val === "false" ? false : val
  }
  return map
}

// marker 形如 `var lists = formatSong(` 或 `var list = `
function objectsIn(html, marker) {
  const at = html.indexOf(marker)
  if (at < 0) return []
  const start = html.indexOf("[", at)
  if (start < 0) return []
  const end = html.indexOf("];", start)
  const body = html.slice(start + 1, end < 0 ? undefined : end)
  return splitObjects(body).map(fields)
}

function msOf(text) {
  if (!text || typeof text !== "string") return 0
  const parts = text.split(":").map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return 0
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
  return 0
}

function absMedia(url) {
  if (!url) return ""
  if (/^https?:/.test(url)) return url
  if (url.startsWith("//")) return "http:" + url
  return MEDIA + "/" + url.replace(/^\//, "")
}

function artistOf(name, id) {
  const clean = String(name || "").replace(/^\s*\|\s*/, "").trim()
  if (!clean) return []
  // 「群星 / 某某」这类用斜杠并列的，拆成多个
  return clean.split(/\s*[\/、,，]\s*/).filter(Boolean).map((n, i) => ({
    id: i === 0 && id ? String(id) : "",
    name: n,
  }))
}

function trackOf(o, extra = {}) {
  const id = String(o.id ?? o.songId ?? o.song_id ?? "")
  return {
    id,
    name: String(o.songName ?? o.song_name ?? o.name ?? ""),
    artists: artistOf(o.musician ?? o.musicianName ?? o.musician_name ?? o.misicianName, o.musicianId ?? o.misicianId ?? o.user_id),
    album: {
      id: String(o.discId ?? extra.albumId ?? ""),
      name: String(extra.albumName ?? ""),
      imageUrl: absMedia(o.discCoverUrl || extra.cover || ""),
    },
    duration: msOf(o.duration),
  }
}

function songCandidates(html) {
  const a = objectsIn(html, "var lists = formatSong(")
  return a.length ? a : objectsIn(html, "var list = ")
}

/* ---------- 批量取详情 ---------- */

// /music?ids=1,2,3 一次能拿多首，曲目页里带 discCoverUrl / duration / songUrl
async function detailsFor(ids) {
  const wanted = ids.map(String).filter(Boolean)
  if (!wanted.length) return new Map()
  const html = await getText(`${WEB}/music?ids=${wanted.map(encodeURIComponent).join(",")}`)
  const songs = objectsIn(html, "var lists = formatSong(")
  const map = new Map()
  for (const s of songs) {
    const id = String(s.id || "")
    if (!id) continue
    map.set(id, {
      id,
      name: String(s.songName || ""),
      artist: String(s.musician || ""),
      artistId: String(s.musicianId || ""),
      albumId: String(s.discId || ""),
      cover: absMedia(s.discCoverUrl || ""),
      duration: msOf(s.duration),
      url: absMedia(s.songUrl || ""),
    })
  }
  return map
}

/** 把一批 Track 用详情补齐封面/时长（失败就算了，别让首页整页挂掉） */
async function withDetails(tracks) {
  if (!tracks.length) return tracks
  try {
    const map = await detailsFor(tracks.map((x) => x.id))
    return tracks.map((t) => {
      const d = map.get(t.id)
      if (!d) return t
      return {
        ...t,
        name: t.name || d.name,
        artists: t.artists?.length ? t.artists : artistOf(d.artist, d.artistId),
        album: {
          id: d.albumId || t.album?.id || "",
          name: t.album?.name || "",
          imageUrl: t.album?.imageUrl || d.cover || "",
        },
        duration: t.duration || d.duration,
      }
    })
  } catch {
    return tracks
  }
}

/* ---------- 歌曲详情缓存 ---------- */

const songCache = new Map()

async function songDetail(id) {
  id = String(id)
  if (songCache.has(id)) return songCache.get(id)
  const html = await getText(`${WEB}/music?ids=${encodeURIComponent(id)}`)
  const songs = objectsIn(html, "var lists = formatSong(")
  const hit = songs.find((s) => String(s.id) === id) || songs[0]
  if (!hit) throw new PluginError("unavailable", t("这首歌在九天音乐上找不到了"))
  const detail = {
    id,
    name: String(hit.songName || ""),
    artist: String(hit.musician || ""),
    artistId: String(hit.musicianId || ""),
    albumId: String(hit.discId || ""),
    cover: absMedia(hit.discCoverUrl || ""),
    duration: msOf(hit.duration),
    url: absMedia(hit.songUrl || ""),
  }
  songCache.set(id, detail)
  return detail
}

/* ---------- 搜索 ---------- */

export async function search({ query, kind, offset }) {
  if (offset > 0) return { [kind]: [], more: false }
  if (!query || !query.trim()) throw new PluginError("unsupported", t("请输入关键词"))
  const data = await getJSON(`${SEARCH_API}?content=${encodeURIComponent(query.trim())}`)
  const items = Array.isArray(data?.data) ? data.data : []

  if (kind === "tracks") {
    const tracks = items
      .filter((x) => x.type === "song")
      .map((x) => ({
        id: String(x.id),
        name: String(x.label || ""),
        artists: artistOf(x.musician),
        album: { id: "", name: "", imageUrl: "" },
        duration: 0,
      }))
    return { tracks: await withDetails(tracks), more: false }
  }
  if (kind === "albums") {
    const albums = items
      .filter((x) => x.type === "disc")
      .map((x) => ({
        id: String(x.id),
        name: String(x.label || ""),
        artists: artistOf(x.musician),
      }))
    return { albums, more: false }
  }
  if (kind === "artists") {
    const artists = items
      .filter((x) => x.type === "musician")
      .map((x) => ({ id: String(x.id), name: String(x.label || "") }))
    return { artists, more: false }
  }
  return { [kind]: [], more: false }
}

/* ---------- 首页 ---------- */

async function hotSongs() {
  const data = await getJSON(`${WEB}/main/listening/index`)
  const list = data?.data?.list || []
  const tracks = list.map((x) =>
    trackOf({
      songId: x.songId,
      songName: x.songName,
      musicianName: x.musicianName,
      musicianId: x.musicianId,
      songUrl: x.songUrl,
    })
  )
  return withDetails(tracks)
}

async function recommendDiscs() {
  const data = await getJSON(`${WEB}/main/recommend/list`)
  const list = data?.data?.free_disclist || []
  return list.map((x) => ({
    id: String(x.disc_id),
    name: String(x.disc_name || ""),
    imageUrl: absMedia(x.disc_img_url || ""),
    artists: artistOf(x.musician_name, x.musician_id),
  }))
}

async function charts() {
  const data = await getJSON(`${WEB}/main/top/disc/list`)
  return (data?.data?.list || []).map((c) => ({
    id: String(c.sort),
    name: String(c.top || ""),
    songs: (c.list || []).map((s) => ({
      id: String(s.song_id),
      name: String(s.song_name || ""),
      artists: artistOf(s.musician_name, s.user_id),
      album: { id: String(s.user_id || ""), name: "", imageUrl: absMedia(s.song_img_url || "") },
      duration: 0,
    })),
  }))
}

export async function home() {
  const [hot, discs, boards] = await Promise.all([hotSongs(), recommendDiscs(), charts()])
  return {
    title: t("九天音乐"),
    subtitle: t("免费高品质原创音乐"),
    sections: [
      {
        title: t("正在热听"),
        subtitle: t("大家最近在听的"),
        tracks: hot,
        morePage: "charts",
      },
      { title: t("推荐唱片"), albums: discs },
      {
        title: t("排行榜"),
        links: boards.map((b) => ({ title: b.name, subtitle: `${b.songs.length} 首`, page: `chart:${b.id}` })),
      },
    ],
  }
}

export async function browse({ page }) {
  if (page === "charts" || page === "" || page == null) {
    const boards = await charts()
    return {
      title: t("排行榜"),
      sections: boards.map((b) => ({ title: b.name, tracks: b.songs, pageTitle: b.name })),
    }
  }
  const m = /^chart:(\d+)$/.exec(page)
  if (m) {
    const boards = await charts()
    const board = boards.find((b) => b.id === m[1])
    if (!board) throw new PluginError("unavailable", t("没有这个榜单"))
    return { title: board.name, sections: [{ tracks: board.songs }] }
  }
  throw new PluginError("unsupported", t("没有这一页"))
}

/* ---------- 唱片 / 音乐人 ---------- */

function discMeta(html) {
  const name = (html.match(/class="album_name">([^<]*)</) || [])[1] || (html.match(/<title>([^<|]*)/) || [])[1] || ""
  const cover = (html.match(/src="(http:\/\/sp\.9sky\.com\/disc\/cover\/[^"?]+)/) || [])[1] || ""
  // 唱片页的音乐人是 <a href="/musician/detail?id=…"><img …/><i>名字</i></a>
  const musician = (html.match(/musician\/detail\?id=(\d+)"[^>]*>(?:[\s\S]{0,200}?<i>([^<]*)<\/i>|([^<]*)<\/a>)/) || [])
  return {
    name: name.trim(),
    cover,
    artistId: musician[1] || "",
    artistName: (musician[2] || musician[3] || "").trim(),
  }
}

export async function album({ id }) {
  const html = await getText(`${WEB}/disc/detail?id=${encodeURIComponent(id)}`)
  const meta = discMeta(html)
  const songs = objectsIn(html, "var list = ")
  if (!meta.name && !songs.length) throw new PluginError("unavailable", t("这张唱片在九天音乐上找不到了"))
  const albumInfo = {
    id: String(id),
    name: meta.name,
    imageUrl: absMedia(meta.cover),
    artists: artistOf(meta.artistName, meta.artistId),
  }
  const tracks = songs.map((s) =>
    trackOf(s, { albumId: String(id), albumName: meta.name, cover: meta.cover })
  )
  return { album: albumInfo, tracks }
}

export async function artist({ id }) {
  const html = await getText(`${WEB}/musician/detail?id=${encodeURIComponent(id)}`)
  const name = (html.match(/class="ian_name">([^<]*)</) || [])[1] || ""
  if (!name) throw new PluginError("unavailable", t("这位音乐人在九天音乐上找不到了"))
  const image = (html.match(/src="(http:\/\/sp\.9sky\.com\/musician\/poster\/[^"]+)"/) || [])[1] || ""
  const albums = []
  const re = /href="\/disc\/detail\?id=(\d+)">\s*<img[^>]*src="([^"]+)"\s*\/>\s*<span>([^<]*)<\/span>/g
  let m
  while ((m = re.exec(html))) {
    albums.push({
      id: m[1],
      name: m[3],
      imageUrl: absMedia(m[2]),
      artists: [{ id: String(id), name }],
    })
  }
  return {
    artist: { id: String(id), name, imageUrl: absMedia(image) },
    tracks: [],
    albums,
  }
}

/* ---------- 电台式榜单 ---------- */

export async function stations() {
  const boards = await charts()
  return boards.map((b) => ({
    id: `chart:${b.id}`,
    name: b.name,
    description: t("九天音乐排行榜，持续播放"),
    imageUrl: b.songs[0]?.album?.imageUrl || "",
  }))
}

const served = new Set()

export async function stationNext({ id }) {
  const m = /^chart:(\d+)$/.exec(String(id || ""))
  if (!m) throw new PluginError("unsupported", t("不支持的榜单"))
  if (served.has(m[1])) return []
  served.add(m[1])
  const boards = await charts()
  const board = boards.find((b) => b.id === m[1])
  return board ? withDetails(board.songs) : []
}

/* ---------- 歌词 / 播放 ---------- */

export async function lyrics({ id }) {
  const data = await getJSON(`${WEB}/main/musician/song/lyric?id=${encodeURIComponent(id)}`)
  const lrc = (data?.data?.lyric || "").trim()
  if (!lrc) throw new PluginError("unavailable", t("这首歌没有歌词"))
  return { lrc }
}

export async function stream({ id, quality }) {
  const detail = await songDetail(id)
  if (!detail.url) throw new PluginError("unavailable", t("这首歌在九天音乐上没有试听地址"))
  return { url: detail.url, type: "mp3", quality }
}
