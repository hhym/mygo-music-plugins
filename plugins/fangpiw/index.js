const SITE = {
  "id": "fangpiw",
  "name": "放屁网",
  "version": "0.1.0",
  "base": "https://www.fangpiw.com",
  "kind": "fangpi",
  "subtitle": "音乐 MP3 高品质在线免费下载与播放",
  "note": "首页、搜索、详情与 /member/common-play-url 播放地址均已实测可用；源站偶发 503，插件已做重试。",
  "deadHome": false,
  "allowFallback": true,
  "localDefault": false,
  "nav": [
    {
      "title": "热门珍藏",
      "path": "/hot-music"
    },
    {
      "title": "本周热搜",
      "path": "/top/week-search"
    },
    {
      "title": "本周下载",
      "path": "/top/week-download"
    }
  ],
  "detailPattern": "^/music/\\d+$"
};
const BASE = SITE.base;
const NAME = SITE.name;
const KIND = SITE.kind;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TTL = 3 * 60 * 1000;
const cache = new Map();
const known = new Map();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }

function clean(s) {
  return String(s || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
function abs(u) {
  if (!u) return "";
  u = String(u).trim().replace(/\\\//g, "/");
  if (/^https?:/i.test(u)) return u;
  if (u.startsWith("//")) return "https:" + u;
  return BASE + (u.startsWith("/") ? u : "/" + u);
}
function pathOf(href) {
  if (!href) return "";
  try {
    if (/^https?:/i.test(href)) {
      const u = new URL(href);
      return u.pathname + u.search;
    }
  } catch (e) {}
  if (!href.startsWith("/")) return "";
  return href;
}
function artistOf(name) {
  const i = String(name || "").indexOf("-");
  if (i < 1) return [];
  return [{ id: "", name: clean(name.slice(0, i)) }];
}
function songName(raw) {
  return clean(raw)
    .replace(/mp3免费下载.*$/i, "")
    .replace(/歌曲免费下载.*$/i, "")
    .replace(/mp3下载.*$/i, "")
    .replace(/歌曲下载.*$/i, "")
    .replace(/在线试听.*$/i, "")
    .replace(/_?免费音乐下载网.*$/i, "")
    .replace(/\s*[-|_]\s*(世纪音乐网|Hi歌曲音乐网|IN音乐网|歌曲海.*|放屁网.*|7082音乐网.*)$/i, "")
    .replace(/_?\s*MP3歌曲免费下载.*$/i, "")
    .replace(/\s*歌曲免费下载.*$/i, "")
    .replace(/\s*MP3\s*$/i, "")
    .replace(/🔥+/g, "")
    .trim();
}
function shijiParts(raw) {
  const t = clean(raw);
  if (/\s+-\s+/.test(t)) {
    const parts = t.split(/\s+-\s+/);
    return { name: parts[0].trim(), artist: parts.slice(1).join(" - ").trim() };
  }
  const i = t.indexOf("-");
  if (i > 0) return { artist: t.slice(0, i).trim(), name: t.slice(i + 1).trim() };
  return { name: t, artist: "" };
}
function makeAlbum(path, name, imageUrl, artist) {
  return {
    id: path,
    name: clean(name) || "未命名歌曲",
    imageUrl: abs(imageUrl || ""),
    artists: artist ? [{ id: "", name: clean(artist) }] : artistOf(name),
  };
}
function makeTrack(path, name, imageUrl, artist, duration) {
  const album = makeAlbum(path, name, imageUrl, artist);
  return {
    id: path,
    name: album.name,
    artists: album.artists,
    album,
    duration: Number(duration) || 0,
  };
}
function remember(a) { if (a && a.id) known.set(a.id, a); }
function isJunk(name) {
  return /^(首页|最近更新|华语音乐|欧美音乐|日韩音乐|DJ舞曲|精选合集|合集打包|全部|更多|排行榜|搜索|登录|注册|下载|免责声明|联系我们|热门搜索|热门推荐|最新推荐|最新歌曲|新歌榜|热歌榜|飙升榜|歌手|歌单|歌曲|音乐|播放|试听|详情|下一页|上一页)$/.test(String(name || "").trim());
}

async function fetchText(pathOrUrl, opts) {
  opts = opts || {};
  const rel = /^https?:/i.test(pathOrUrl)
    ? pathOrUrl.replace(/^https?:\/\/[^/]+/i, "")
    : pathOrUrl;
  const key = rel + "|" + (opts.method || "GET") + "|" + (opts.body || "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let last = null;
  const tries = opts.method === "POST" ? 1 : 3;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + rel, {
        method: opts.method || "GET",
        redirect: "follow",
        headers: {
          "user-agent": UA,
          referer: opts.referer || (BASE + "/"),
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          ...(opts.headers || {}),
        },
        body: opts.body,
      });
      const text = await res.text();
      if (!res.ok) throw fail("upstream", `源站 HTTP ${res.status}`);
      if (!text || text.length < 80) throw fail("upstream", "源站返回空页面");
      if (/upstream connect error|系统安全验证|滑动验证|Just a moment|访问异常/i.test(text) && text.length < 4000) {
        throw fail("unavailable", `${NAME}源站需要验证或暂时不可用`);
      }
      if (text.length < 600 && /window\.location\.href\s*=/.test(text)) {
        throw fail("unavailable", `${NAME}源站返回了跳转挑战页`);
      }
      cache.set(key, { t: Date.now(), v: text });
      return text;
    } catch (e) {
      last = e;
      await wait(450 + i * 650);
    }
  }
  throw last || fail("unavailable", `${NAME}暂时无法访问`);
}

function anchors(html) {
  const out = [];
  const re = /<a\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const hm = attrs.match(/href=(?:"([^"]*)"|'([^']*)')/i) || [];
    const tm = attrs.match(/title=(?:"([^"]*)"|'([^']*)')/i) || [];
    out.push({ href: hm[1] || hm[2] || "", title: clean(tm[1] || tm[2] || ""), text: clean(m[2]), html: m[2] });
  }
  return out;
}

function detailRe() {
  if (SITE.detailPattern) return new RegExp(SITE.detailPattern, "i");
  if (KIND === "shiji") return /^\/thread\/\d+\.html$/i;
  if (KIND === "hi") return /^\/(?:player|song)\/\d+\/?$/i;
  if (KIND === "gequ") return /^\/play\/\d+$/i;
  if (KIND === "7082") return /^\/play\/\d+\.html$/i;
  if (KIND === "fangpi") return /^\/music\/\d+$/i;
  return /^\/(?:play|music|song|thread|post|mp3|audio|sound|listen|detail|info)\/\d+(?:\.html|\.php|\/)?$/i;
}
function isDetail(path) { return !!path && detailRe().test(path); }

function parseAutoCards(html, limit) {
  const out = [];
  const seen = new Set();
  for (const a of anchors(html)) {
    const path = pathOf(a.href);
    if (!path || !isDetail(path) || seen.has(path)) continue;
    const name = songName(a.title || a.text);
    if (!name || name.length < 2 || isJunk(name)) continue;
    seen.add(path);
    out.push(makeAlbum(path, name, "", ""));
    if (out.length >= (limit || 60)) break;
  }
  return out;
}

function parseShiji(html, limit) {
  const out = [];
  const seen = new Set();
  for (const a of anchors(html)) {
    const path = pathOf(a.href);
    if (!path || !/^\/thread\/\d+\.html$/i.test(path) || seen.has(path)) continue;
    const cell = (a.html.match(/class="col-25[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    const raw = songName(cell || a.title || a.text);
    if (!raw || raw.length < 2 || isJunk(raw)) continue;
    const parts = shijiParts(raw);
    const name = parts.name;
    if (!name || name.length < 2) continue;
    seen.add(path);
    out.push(makeAlbum(path, name, "", parts.artist));
    if (out.length >= (limit || 60)) break;
  }
  return out;
}

function parseTrending(html) {
  const out = [];
  const seen = new Set();
  for (const block of String(html).split(/class="trending-item"/i).slice(1)) {
    const rid = (block.match(/onclick="go(?:Player|song)\('(\d+)'\)/i) || [])[1];
    if (!rid) continue;
    const title = clean((block.match(/class="trending-title">([\s\S]*?)<\/div>/i) || [])[1] || "");
    const artist = clean((block.match(/class="trending-artist">([\s\S]*?)<\/div>/i) || [])[1] || "");
    if (!title) continue;
    const path = `${SITE.detailPrefix}${rid}/`;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(makeAlbum(path, title, "", artist));
  }
  return out;
}

function parseHiResults(html) {
  const out = [];
  const seen = new Set();
  for (const block of String(html).split(/class="result-item"/i).slice(1)) {
    const rid = (block.match(/data-rid="(\d+)"/i) || [])[1];
    if (!rid) continue;
    const title = clean((block.match(/class="result-title">([\s\S]*?)<\/div>/i) || [])[1] || "");
    const artist = clean((block.match(/class="result-artist">([\s\S]*?)<\/div>/i) || [])[1] || "");
    if (!title) continue;
    const path = `${SITE.detailPrefix}${rid}/`;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(makeAlbum(path, title, "", artist));
  }
  return out;
}

function parseGequ(html, limit) {
  const out = [];
  const seen = new Set();
  for (const block of String(html).split(/<tr\b/i).slice(1)) {
    const m = block.match(/href="\/play\/(\d+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    const path = `/play/${m[1]}`;
    if (seen.has(path)) continue;
    const name = songName(m[2]);
    if (!name || isJunk(name)) continue;
    const img = (block.match(/<img[^>]+src=(?:"([^"]+)"|'([^']+)')/i) || []);
    const artist = clean((block.match(/<td[^>]*color:\s*#666[^>]*>([\s\S]*?)<\/td>/i) || [])[1] || "");
    seen.add(path);
    out.push(makeAlbum(path, name, img[1] || img[2] || "", artist));
    if (out.length >= (limit || 60)) break;
  }
  return out;
}

function parse7082(html, limit) {
  const out = [];
  const seen = new Set();
  for (const a of anchors(html)) {
    const path = pathOf(a.href);
    if (!path || !/^\/play\/\d+\.html$/i.test(path) || seen.has(path)) continue;
    const name = songName(a.title || a.text);
    if (!name || name.length < 2 || isJunk(name)) continue;
    seen.add(path);
    out.push(makeAlbum(path, name, "", ""));
    if (out.length >= (limit || 60)) break;
  }
  return out;
}

function parseFangpi(html, limit) {
  const out = [];
  const seen = new Set();
  for (const a of anchors(html)) {
    const path = pathOf(a.href);
    if (!path || !/^\/music\/\d+$/i.test(path) || seen.has(path)) continue;
    let raw = a.title || a.text;
    let name = raw;
    let artist = "";
    const dash = raw.lastIndexOf(" - ");
    if (dash > 0) { name = raw.slice(0, dash); artist = raw.slice(dash + 3); }
    name = songName(name);
    if (!name || name.length < 2 || isJunk(name)) continue;
    seen.add(path);
    out.push(makeAlbum(path, name, "", artist));
    if (out.length >= (limit || 60)) break;
  }
  return out;
}

function homeLink(path, title) { return { title, page: `cat:${encodeURIComponent(path)}:1` }; }

export async function home() {
  try {
    let items = [];
    let extra = [];
    if (KIND === "shiji") {
      items = parseShiji(await fetchText("/"), 40);
    } else if (KIND === "hi") {
      const html = await fetchText("/");
      items = parseTrending(html);
      try { extra = parseHiResults(await fetchText(SITE.homeExtra || "/xinge/"), 40); } catch (e) {}
    } else if (KIND === "gequ") {
      items = parseGequ(await fetchText("/top/new"), 40);
    } else if (KIND === "7082") {
      items = parse7082(await fetchText("/"), 40);
    } else if (KIND === "fangpi") {
      items = parseFangpi(await fetchText("/hot-music"), 40);
    } else {
      items = parseAutoCards(await fetchText("/"), 40);
    }
    const all = [];
    const seen = new Set();
    for (const a of [...items, ...extra]) {
      if (!a || seen.has(a.id)) continue;
      seen.add(a.id);
      all.push(a);
    }
    if (!all.length) throw fail("unavailable", `${NAME}首页没有解析到歌曲，源站可能改版或尚未恢复`);
    for (const a of all) remember(a);
    const sections = [];
    if (KIND === "hi") {
      sections.push({ title: "热门搜索", albums: items });
      if (extra.length) sections.push({ title: "最新歌曲", albums: extra });
    } else {
      sections.push({ title: "最新推荐", albums: all });
    }
    if (SITE.nav && SITE.nav.length) {
      sections.push({ title: "分类", links: SITE.nav.map((c) => homeLink(c.path, c.title)) });
    }
    return { title: NAME, subtitle: SITE.subtitle || "音乐在线试听", sections };
  } catch (e) {
    if (SITE.allowFallback) return fallbackPage(e && e.message ? e.message : String(e));
    throw e;
  }
}

function fallbackPage(reason) {
  return {
    title: NAME,
    subtitle: BASE,
    description: SITE.note || "源站当前无法访问。",
    sections: [
      { title: "站点状态", empty: `${SITE.note || "暂时无法访问"}（${reason}）`, tracks: [] },
      { title: "站点入口", links: [{ title: `打开 ${BASE}`, page: "about" }] },
    ],
  };
}

function pagePath(path, n) {
  if (n <= 1) return path;
  if (KIND === "shiji") return path.replace(/\.html$/i, `_${n}.html`);
  if (KIND === "7082") return path.replace(/(\d+)\.html$/i, `${n}.html`);
  if (KIND === "gequ" || KIND === "fangpi") return path + (path.includes("?") ? "&" : "?") + "page=" + n;
  if (KIND === "hi") return path.endsWith("/") ? `${path}${n}/` : `${path}/${n}/`;
  return path + (path.includes("?") ? "&" : "?") + "page=" + n;
}

export async function browse({ page } = {}) {
  if (!page || page === "categories") {
    if (!SITE.nav || !SITE.nav.length) {
      return {
        title: "分类",
        subtitle: NAME,
        sections: [{ title: "站点说明", empty: SITE.note || "该站点没有公开分类。", tracks: [] }],
      };
    }
    return { title: "分类", sections: [{ title: "全部分类", links: SITE.nav.map((c) => homeLink(c.path, c.title)) }] };
  }
  if (page === "about") {
    return {
      title: NAME,
      subtitle: BASE,
      description: SITE.note || "",
      sections: [{ title: "站点状态", empty: SITE.note || "请在浏览器中打开站点查看。", tracks: [] }],
    };
  }
  const m = String(page).match(/^cat:(.+):(\d+)$/);
  if (!m) throw fail("unavailable", "没有这个页面");
  const path = decodeURIComponent(m[1]);
  const n = Number(m[2]) || 1;
  const html = await fetchText(pagePath(path, n));
  let items = [];
  if (KIND === "shiji") items = parseShiji(html);
  else if (KIND === "hi") items = parseHiResults(html);
  else if (KIND === "gequ") items = parseGequ(html);
  else if (KIND === "7082") items = parse7082(html);
  else if (KIND === "fangpi") items = parseFangpi(html);
  else items = parseAutoCards(html);
  for (const a of items) remember(a);
  const nav = (SITE.nav || []).find((c) => c.path === path);
  const title = nav ? nav.title : "歌曲列表";
  return {
    title,
    subtitle: `第 ${n} 页`,
    sections: items.length
      ? [{ title: `${title} · 第 ${n} 页`, albums: items }]
      : [{ title, empty: "这一页没有歌曲。", tracks: [] }],
  };
}

async function trySearch(path) {
  try {
    const html = await fetchText(path);
    if (KIND === "hi") return parseHiResults(html);
    if (KIND === "gequ") return parseGequ(html);
    if (KIND === "7082") return parse7082(html);
    if (KIND === "fangpi") return parseFangpi(html);
    if (KIND === "shiji") return parseShiji(html);
    let items = parseAutoCards(html);
    if (!items.length) items = parseGequ(html);
    return items;
  } catch (e) { return []; }
}

export async function search({ query, kind = "albums", offset = 0 } = {}) {
  const term = String(query || "").trim();
  if (!term) return { albums: [], tracks: [], more: false };
  if (kind === "artists" || kind === "playlists" || kind === "shows") {
    return { [kind]: [], more: false };
  }
  let items = [];
  if (KIND === "shiji") {
    items = await trySearch(`/search.php?q=${encodeURIComponent(term)}`);
  } else if (KIND === "hi") {
    const tpl = SITE.searchPath || "/s/{q}/1/";
    items = await trySearch(tpl.replace("{q}", encodeURIComponent(term)));
  } else if (KIND === "gequ") {
    items = await trySearch(`/search?s=${encodeURIComponent(term)}`);
  } else if (KIND === "7082") {
    items = await trySearch(`/include/search.php?ac=play&key=${encodeURIComponent(term)}`);
  } else if (KIND === "fangpi") {
    items = await trySearch(`/s/${encodeURIComponent(term)}`);
  } else if (!SITE.deadHome) {
    for (const p of [
      `/search.php?q=${encodeURIComponent(term)}`,
      `/search?keyword=${encodeURIComponent(term)}`,
      `/search?q=${encodeURIComponent(term)}`,
      `/s?kw=${encodeURIComponent(term)}`,
      `/so/${encodeURIComponent(term)}`,
    ]) {
      items = await trySearch(p);
      if (items.length) break;
    }
  }
  const off = Math.max(0, Number(offset) || 0);
  const page = items.slice(off, off + 40);
  for (const a of page) remember(a);
  if (kind === "tracks") {
    return { tracks: page.map((a) => makeTrack(a.id, a.name, a.imageUrl, (a.artists[0] || {}).name || "")), more: items.length > off + 40 };
  }
  return { albums: page, more: items.length > off + 40 };
}

export async function suggest({ query } = {}) {
  const r = await search({ query });
  return (r.albums || []).slice(0, 8).map((a) => a.name);
}

function metaImage(html) {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return m ? abs(m[1]) : "";
}
function titleTag(html) { return clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""); }
function durationMs(txt) {
  const m = String(txt || "").match(/(\d{1,2}):(\d{2})/);
  return m ? ((Number(m[1]) * 60 + Number(m[2])) * 1000) : 0;
}
function splitSongArtist(s) {
  const t = clean(s);
  const i = t.lastIndexOf(" - ");
  if (i > 0) return { name: t.slice(0, i).trim(), artist: t.slice(i + 3).trim() };
  const j = t.indexOf("-");
  if (j > 0) return { name: t.slice(0, j).trim(), artist: t.slice(j + 1).trim() };
  return { name: t, artist: "" };
}

function parseAppData(html) {
  const m = html.match(/window\.appData\s*=\s*JSON\.parse\('([\s\S]*?)'\)\s*;/i);
  if (!m) return null;
  let raw = m[1].replace(/\\\\/g, "\\").replace(/\\u0022/g, '"').replace(/\\'/g, "'");
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function parseAlbumMeta(html, path) {
  let name = "";
  let artist = "";
  let audioTitle = "";
  let imageUrl = metaImage(html);
  let duration = 0;
  let app = null;
  if (KIND === "hi") {
    const t = clean((html.match(/<h1[^>]+id="music-title"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
    const s = splitSongArtist(t);
    name = s.name; artist = s.artist; audioTitle = t;
    const img = html.match(/<img[^>]+id="album-cover"[^>]+src=(?:"([^"]+)"|'([^']+)')/i) || [];
    if (img[1] || img[2]) imageUrl = img[1] || img[2];
  } else if (KIND === "gequ") {
    name = clean((html.match(/window\.mp3_title\s*=\s*'([^']*)'/i) || [])[1] || "");
    artist = clean((html.match(/window\.mp3_author\s*=\s*'([^']*)'/i) || [])[1] || "");
    audioTitle = `${artist}-${name}`;
    const c = (html.match(/window\.mp3_cover\s*=\s*'([^']*)'/i) || [])[1];
    if (c) imageUrl = c;
  } else if (KIND === "7082") {
    name = clean((html.match(/class="djname"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "");
    audioTitle = name;
  } else if (KIND === "fangpi") {
    app = parseAppData(html);
    if (app) {
      name = clean(app.mp3_title || "");
      artist = clean(app.mp3_author || "");
      audioTitle = `${name}-${artist}`;
      imageUrl = app.mp3_cover || imageUrl;
      duration = durationMs(app.mp3_duration);
    }
  } else {
    const esc = (html.match(/(?:const|var|let)\s+escapedTitle\s*=\s*'([^']*)'/i) || [])[1];
    if (esc) {
      const full = esc.replace(/&amp;/g, "&");
      audioTitle = full;
      const parts = shijiParts(full);
      artist = clean(parts.artist);
      name = songName(parts.name);
    }
  }
  if (!name) {
    const tag = titleTag(html);
    const s = splitSongArtist(songName(tag.split(/[_|]/)[0]));
    name = s.name; artist = artist || s.artist;
    if (!audioTitle) audioTitle = s.name;
  }
  if (!name) name = (known.get(path) || {}).name || "未命名歌曲";
  if (!isJunk(name)) {
    const s = splitSongArtist(name);
    if (s.artist && !artist) artist = s.artist;
    name = s.name;
  }
  return { name, artist, audioTitle: audioTitle || name, imageUrl: abs(imageUrl), duration, app, description: clean((html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1] || "") };
}

export async function album({ id } = {}) {
  const p0 = String(id || "");
  if (SITE.deadHome) throw fail("unavailable", SITE.note || "该站点当前没有可播放内容");
  const path = isDetail(p0) ? p0 : (known.get(p0) || {}).id || p0;
  if (!path || !isDetail(path)) throw fail("unavailable", "没有这个歌曲");
  const html = await fetchText(path);
  const meta = parseAlbumMeta(html, path);
  const a = makeAlbum(path, meta.name, meta.imageUrl, meta.artist);
  remember(a);
  return {
    album: { ...a, description: meta.description || "" },
    tracks: [makeTrack(path, meta.name, meta.imageUrl, meta.artist, meta.duration)],
  };
}

function b64decode(s) {
  s = String(s || "").replace(/[^A-Za-z0-9+/=]/g, "");
  try { if (typeof atob === "function") return atob(s); } catch (e) {}
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < s.length; i += 4) {
    const a = chars.indexOf(s[i]);
    const b = chars.indexOf(s[i + 1]);
    const c = chars.indexOf(s[i + 2]);
    const d = chars.indexOf(s[i + 3]);
    if (a < 0 || b < 0) break;
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}

function extractAudio(html, name) {
  const cands = [];
  let m;
  const b64 = (html.match(/encodedUrl\s*=\s*"([^"]+)"/i) || [])[1];
  if (b64) {
    try { const u = b64decode(b64); if (/^https?:/i.test(u)) cands.push(u); } catch (e) {}
  }
  m = html.match(/<audio[^>]+src=(?:"([^"]+)"|'([^']+)')/i); if (m) cands.push(m[1] || m[2]);
  m = html.match(/<source[^>]+src=(?:"([^"]+)"|'([^']+)')/i); if (m) cands.push(m[1] || m[2]);
  for (const re of [/url\s*:\s*'([^']+)'/i, /url\s*:\s*"([^"]+)"/i, /url\s*:\s*`([^`]+)`/i, /"url"\s*:\s*"([^"]+)"/i, /play_url\s*[:=]\s*['"]([^'"]+)['"]/i]) {
    m = html.match(re); if (m) cands.push(m[1]);
  }
  m = html.match(/https?:\/\/[^"'\s<>\\]+\.(?:mp3|m4a|aac|flac)(?:\?[^"'\s<>]*)?/i); if (m) cands.push(m[0]);
  const title = String(name || "").replace(/`/g, "");
  for (let u of cands) {
    if (!u) continue;
    u = String(u).replace(/\\\//g, "/").replace(/&amp;/g, "&");
    if (u.includes("${encodedTitle}")) u = u.replace(/\$\{encodedTitle\}/g, encodeURIComponent(title));
    else if (u.includes("${title}")) u = u.replace(/\$\{title\}/g, encodeURIComponent(title));
    u = abs(u);
    if (/^https?:/i.test(u)) return u;
  }
  return "";
}

function audioType(u) {
  if (/\.m4a(?:[?#]|$)/i.test(u)) return "m4a";
  if (/\.flac(?:[?#]|$)/i.test(u)) return "flac";
  if (/\.aac(?:[?#]|$)/i.test(u)) return "aac";
  return "mp3";
}

const isWindows = () => /win/i.test(host.platform || "");
const FFMPEG = {
  darwin: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"],
  linux: ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"],
  win32: ["ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"],
};
const slots = () => { try { return JSON.parse(host.storage.get("slots") || "[]"); } catch (e) { return []; } };
const saveSlots = (v) => host.storage.set("slots", JSON.stringify(v));
const slotOf = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 8; return h; };
function fileFor(slot, ext) { return `${String(host.dataDir).replace(/[\\/]+$/, "")}${isWindows() ? "\\" : "/"}${SITE.id}-${slot}.${ext}`; }
function fileURL(path) {
  let p = String(path).replace(/\\/g, "/");
  if (!p.startsWith("/")) p = "/" + p;
  return "file://" + p.split("/").map((x) => encodeURIComponent(x).replace(/%3A/gi, ":")).join("/");
}
function localOn() {
  const v = host.setting("localCache");
  return v == null || v === "" ? !!SITE.localDefault : String(v) === "1";
}
async function toLocal(url, target, referer) {
  let last = "";
  for (const bin of [...(host.setting("ffmpegPath") ? [host.setting("ffmpegPath")] : []), "ffmpeg", ...(FFMPEG[host.platform] || [])]) {
    try {
      const p = host.spawn(bin, ["-y", "-hide_banner", "-loglevel", "error", "-headers", `Referer: ${referer}\r\n`, "-user_agent", UA, "-i", url, "-vn", "-c:a", "copy", target]);
      const code = await p.wait();
      const err = await p.errorOutput();
      if ((code == null || code === 0) && !err) return;
      last = `${bin}: ${String(err).slice(0, 160) || code}`;
    } catch (e) { last = `${bin}: ${e && e.message ? e.message : e}`; }
  }
  throw new Error(last || "ffmpeg not found");
}

async function resolveAudio(html, path) {
  const meta = parseAlbumMeta(html, path);
  if (KIND === "hi") {
    const u = extractAudio(html, meta.audioTitle || meta.name);
    if (!u) throw fail("unavailable", "歌曲页没有返回音频地址");
    return u;
  }
  if (KIND === "gequ") {
    const inline = (html.match(/window\.mp3_url\s*=\s*'([^']*)'/i) || [])[1];
    if (inline && /^https?:/i.test(inline)) return inline;
    const playId = (html.match(/window\.play_id\s*=\s*'([^']*)'/i) || [])[1];
    const type = (html.match(/window\.mp3_type\s*=\s*(\d+)/i) || [])[1] || "0";
    if (!playId) throw fail("unavailable", "歌曲页缺少播放参数");
    const res = await fetch(BASE + "/api/music", {
      method: "POST",
      headers: {
        "user-agent": UA,
        referer: BASE + path,
        origin: BASE,
        "x-requested-with": "http",
        "x-custom-header": "Key",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: `id=${encodeURIComponent(playId)}&type=${encodeURIComponent(type)}`,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!json || json.code !== 200 || !json.data || !json.data.url) {
      throw fail("unavailable", (json && json.msg) || "源站没有返回音频地址");
    }
    return json.data.url;
  }
  if (KIND === "7082") {
    const args = html.match(/lei_play\(\s*"(\d+)"\s*,\s*"([^"]+)"\s*\)/i);
    if (!args) throw fail("unavailable", "歌曲页缺少播放参数");
    const res = await fetch(BASE + "/skin/xle_dj197/play.php", {
      method: "POST",
      headers: {
        "user-agent": UA,
        referer: BASE + path,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: `id=${encodeURIComponent(args[1])}&type=${encodeURIComponent(args[2])}`,
    });
    const json = await res.json().catch(() => null);
    if (!json || json.code !== "1" || !json.url) throw fail("unavailable", (json && json.msg) || "源站没有返回音频地址");
    return json.url;
  }
  if (KIND === "fangpi") {
    const app = parseAppData(html);
    if (!app || !app.play_id) throw fail("unavailable", "歌曲页缺少播放参数");
    const res = await fetch(BASE + "/member/common-play-url", {
      method: "POST",
      headers: {
        "user-agent": UA,
        referer: BASE + path,
        origin: BASE,
        "x-requested-with": "XMLHttpRequest",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: `id=${encodeURIComponent(app.play_id)}&purpose=play`,
    });
    const json = await res.json().catch(() => null);
    if (!json || json.code !== 1 || !json.data || !json.data.url) {
      throw fail("unavailable", (json && json.msg) || "源站没有返回音频地址");
    }
    return json.data.url;
  }
  const u = extractAudio(html, meta.audioTitle || meta.name);
  if (!u) throw fail("unavailable", "歌曲页没有返回音频地址");
  return u;
}

export async function stream({ id } = {}) {
  const p0 = String(id || "");
  if (SITE.deadHome) throw fail("unavailable", SITE.note || "该站点当前没有可播放内容");
  const path = isDetail(p0) ? p0 : (known.get(p0) || {}).id || p0;
  if (!path || !isDetail(path)) throw fail("unavailable", "没有这个歌曲");
  const html = await fetchText(path);
  let u;
  try { u = await resolveAudio(html, path); } catch (e) { throw e.code ? e : fail("unavailable", e.message || "音频解析失败"); }
  u = abs(u);
  const type = audioType(u);
  /* 音频 OSS 带 fangpiw Referer 会直接 403，播放只带 UA。 */
  const headers = { "user-agent": UA };
  if (!localOn()) return { url: u, type, headers, title: "" };
  const all = slots();
  let slot = all.indexOf(path);
  if (slot < 0) { slot = all.findIndex((x) => !x); if (slot < 0) slot = slotOf(path); }
  const ext = type === "flac" ? "flac" : type === "m4a" ? "m4a" : "mp3";
  try {
    const target = fileFor(slot, ext);
    await toLocal(u, target, BASE + path);
    all[slot] = path;
    saveSlots(all);
    return { url: fileURL(target), type: ext === "flac" ? "flac" : ext === "m4a" ? "m4a" : "mp3", title: "" };
  } catch (e) {
    return { url: u, type, headers, title: "" };
  }
}

export function lyrics() { return {}; }

function stored(k, d) { try { const v = host.storage.get(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function like({ id, on } = {}) {
  const s = new Set(stored("liked", []));
  if (on) s.add(String(id)); else s.delete(String(id));
  host.storage.set("liked", JSON.stringify([...s]));
  return { id: String(id), liked: !!on };
}
export function isLiked({ ids } = {}) {
  const s = new Set(stored("liked", []));
  const o = {};
  for (const id of ids || []) o[id] = s.has(String(id));
  return o;
}
export function liked({ offset = 0 } = {}) {
  const all = stored("liked", []).map((id) => known.get(id)).filter(Boolean).map((a) => makeTrack(a.id, a.name, a.imageUrl, (a.artists[0] || {}).name || ""));
  return { tracks: all.slice(offset, offset + 60), more: all.length > offset + 60 };
}
export function played({ id } = {}) {
  if (!id) return {};
  const list = stored("history", []).filter((x) => x !== id);
  list.push(String(id));
  host.storage.set("history", JSON.stringify(list.slice(-100)));
  return {};
}
export function recent() {
  return stored("history", []).slice().reverse().map((id) => known.get(id)).filter(Boolean).map((a) => makeTrack(a.id, a.name, a.imageUrl, (a.artists[0] || {}).name || "")).slice(0, 20);
}
