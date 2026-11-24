// 显示名：听FM电台（tingfm）
const CFG = {
  "name": "听FM电台",
  "base": "https://cn.tingfm.com",
  "mode": "radio",
  "seed": "电台",
  "detail": "/radio/[0-9]+",
  "homePath": "/radio",
  "cats": [],
  "subtitle": "在线电台"
};

const BASE = CFG.base;
const REFERER = BASE + "/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PAGE_TTL = 2 * 60 * 1000;
const CATS = CFG.cats || [];
const DETAIL = CFG.detailRegex || CFG.detail || "NEVERMATCH";
const QT_SEARCH = "https://search.qtfm.cn";
const QT_API = "https://webapi.qtfm.cn";
const QT_WEB = "https://m.qtfm.cn";
const QT_HEAD = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile", origin: QT_WEB, referer: QT_WEB + "/", accept: "application/json,*/*" };
const QT_CATS = [
  { id: "recommend", name: "推荐", query: "电台" },
  { id: "music", name: "音乐", query: "音乐" },
  { id: "news", name: "资讯", query: "资讯" },
  { id: "emotion", name: "情感", query: "情感" },
  { id: "story", name: "故事", query: "故事" },
  { id: "book", name: "有声书", query: "有声书" },
  { id: "comedy", name: "相声", query: "相声" },
  { id: "talk", name: "脱口秀", query: "脱口秀" },
];

const pageCache = new Map();
const knownTracks = new Map();
const qtChannelCache = new Map();
const qtAlbumMeta = new Map();
const qtDocCache = new Map();

function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function stored(k, f) { const v = host.storage.get(k); return v === undefined || v === null ? f : v; }
function keep(k, v) { host.storage.set(k, v); }
function unescapeHtml(s) {
  return String(s).replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, n) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n]).replace(/&[a-zA-Z]+;/g, " ");
}
function clean(s) { return unescapeHtml(String(s || "")).replace(/<[^>]+>/g, " ").replace(/[\s\u00a0]+/g, " ").trim(); }
function absolute(u) { if (!u) return ""; let x = String(u).trim().replace(/\\\//g, "/").replace(/&amp;/g, "&"); if (x.startsWith("//")) return "https:" + x; if (x.startsWith("/")) return BASE + x; return x; }
function toPath(u) { const x = absolute(u); return x.startsWith(BASE) ? x.slice(BASE.length) || "/" : x; }
function attr(tag, name) { const r = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"); const m = r.exec(tag); return m ? (m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]) : ""; }
function imageFrom(html) {
  for (const m of [...String(html).matchAll(/<img\b([^>]*?)>/gi)].reverse()) {
    const src = attr(m[0], "data-original") || attr(m[0], "data-src") || attr(m[0], "src");
    if (src && !/none|blank|loading|lazy\.gif|placeholder/i.test(src)) return absolute(src);
  }
  return "";
}
function makeTrack(id, name, extra = {}) {
  return { id: String(id), name: clean(name), artists: extra.artists || [], album: extra.album || { id: "", name: "", imageUrl: "" }, duration: Number(extra.duration) || 0 };
}
function remember(list) { for (const t of list || []) if (t && t.id) knownTracks.set(String(t.id), t); }
function trackBy(id) { return knownTracks.get(String(id)) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null; }

async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : BASE + path;
  let res;
  try {
    res = await fetch(url, { method: options.method || "GET", headers: { "user-agent": UA, referer: options.referer || REFERER, "accept-language": "zh-CN,zh;q=0.9", accept: "text/html,application/json,*/*", ...(options.body ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...(options.headers || {}) }, body: options.body });
  } catch (e) { throw fail("unavailable", `连不上 ${BASE}：${e && e.message ? e.message : e}`); }
  if (!res.ok) throw fail("unavailable", `${BASE} 返回了 ${res.status}`);
  return res;
}
async function html(path, options = {}) {
  const key = (path.startsWith("http") ? path : BASE + path) + (options.body || "");
  const c = pageCache.get(key);
  if (c && Date.now() - c.at < PAGE_TTL) return c.text;
  const res = await request(path, options);
  let text;
  if (CFG.charset === "gbk") {
    try { text = new TextDecoder("gbk").decode(await res.arrayBuffer()); } catch (e) { text = await res.text(); }
  } else text = await res.text();
  pageCache.set(key, { text, at: Date.now() });
  if (pageCache.size > 80) { const old = [...pageCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (old) pageCache.delete(old[0]); }
  return text;
}

function blockStart(s, i) {
  let start = Math.max(0, i - 2500);
  for (const m of ["<li", "<article", "<tr", "<dd", "<div class=\"item", "<div class='item", "<div class=\"book"]) {
    const at = s.lastIndexOf(m, i - 1);
    if (at > start) start = at;
  }
  return start;
}

function parseList(page) {
  const s = String(page || "");
  let re;
  try { re = new RegExp(DETAIL, "i"); } catch (e) { return []; }
  const out = [], seen = new Set();
  const catPaths = new Set(CATS.map((c) => String(c.path || "").replace("{id}", String(c.id))));
  for (const m of s.matchAll(/<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi)) {
    const tag = m[1] || "", href = attr(tag, "href");
    if (!href || !re.test(href)) continue;
    const name = clean(attr(tag, "title") || m[2]);
    if (!name || name.length < 2 || name.length > 80) continue;
    if (/^(首页|登录|注册|搜索|全部|更多|下一页|上一页|尾页|播放|收听|继续播放|主站|手机版|客户端|排行榜|分类|推荐|最新)$/.test(name)) continue;
    if (/收藏|加入|打赏|排行|书名|作者|主播|搜索|投稿|直播|下载|APP|客户端|登录|注册|首页|更多|全部|主站|评论|标签|频道|专题|手机|恋听网|听小说|建立剧集|资源位|申请|飞卢听书网|搜书|充值|活动|如何|制作|素材|按人气|末页|下一页/i.test(name)) continue;
    if (name === CFG.name) continue;
    const path = toPath(href);
    if (catPaths.has(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const start = blockStart(s, m.index || 0);
    const chunk = s.slice(start, Math.min(s.length, (m.index || 0) + 300));
    const track = makeTrack(path, name, { album: { id: path, name: CFG.name, imageUrl: imageFrom(chunk) } });
    track._detail = absolute(href);
    knownTracks.set(String(track.id), track);
    out.push(track);
  }
  return out.slice(0, 60);
}

// ---- qtfm：频道、节目与排版 ----
function qtCore(n) { return String(n || "").replace(/[《》<>【】\[\]（）()：:·\-—_、，,。.!！?？\s]/g, "").replace(/(长篇|短篇|袍带|评书|有声|小说|经典|全集|在线听|mp3)/gi, ""); }
function qtScore(a, b) { const x = [...qtCore(a)], y = new Set([...qtCore(b)]); if (!x.length || !y.size) return 0; let c = 0; for (const ch of x) if (y.has(ch)) c++; return c / Math.max(x.length, y.size); }

function qtImage(u, size = 400) {
  const x = absolute(u).replace(/^http:/i, "https:");
  if (!x) return "";
  return x.replace(/!\d+$/, "!" + size);
}

function qtAlbumName(d) {
  const desc = clean(d && d.description);
  const fromDesc = desc.match(/来自专辑《([^》]+)》/);
  if (fromDesc) return clean(fromDesc[1]);
  return clean((d && (d.title || d.name)) || "").replace(/[：:（(【\[].*$/, "").trim() || "蜻蜓FM";
}

function qtAlbumFromDoc(d) {
  const type = String((d && d.type) || "");
  const isChannel = type.includes("channel");
  const chid = String(isChannel ? d.id : (d && d.parent_id) || "");
  if (!chid || chid === "undefined") return null;
  const id = `qtfm-ch:${chid}`;
  if (qtAlbumMeta.has(id)) return qtAlbumMeta.get(id);
  const album = {
    id,
    name: qtAlbumName(d),
    imageUrl: qtImage(d && (d.cover || d.coverUrl || d.thumbnail), 400),
    artists: [],
    released: "",
  };
  qtAlbumMeta.set(id, album);
  return album;
}

function qtAlbumsFromDocs(docs, limit = 24) {
  const out = [], seen = new Set();
  for (const d of docs || []) {
    if (out.length >= limit) break;
    const album = qtAlbumFromDoc(d);
    if (!album || seen.has(album.id)) continue;
    seen.add(album.id);
    out.push(album);
  }
  return out;
}

function qtTrackFromDoc(d, albumOverride) {
  if (!d || !d.id) return null;
  const type = String(d.type || "");
  const isChannel = type.includes("channel");
  const chid = String(isChannel ? d.id : (d.parent_id || ""));
  if (!chid) return null;
  const album = albumOverride || qtAlbumFromDoc(d) || {
    id: `qtfm-ch:${chid}`,
    name: qtAlbumName(d),
    imageUrl: qtImage(d.cover, 400),
    artists: [],
  };
  const id = isChannel ? `qtfm:${chid}:1` : `qtfm-prog:${chid}:${d.id}`;
  const artistName = clean(d.podcaster || d.nickname || "蜻蜓FM") || "蜻蜓FM";
  const track = {
    id,
    name: clean(d.title || d.name || "有声节目"),
    artists: [{ id: "", name: artistName }],
    album,
    duration: 0,
  };
  knownTracks.set(String(track.id), track);
  return track;
}

function qtTracksFromDocs(docs, limit = 20, dedupe = false) {
  const out = [], seen = new Set(), albums = new Set();
  for (const d of docs || []) {
    if (out.length >= limit) break;
    const album = qtAlbumFromDoc(d);
    if (!album) continue;
    if (dedupe && albums.has(album.id)) continue;
    const track = qtTrackFromDoc(d, album);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    albums.add(album.id);
    out.push(track);
  }
  return out;
}

async function qtJson(url) {
  const res = await fetch(url, { headers: QT_HEAD });
  if (!res.ok) throw fail("unavailable", `蜻蜓FM ${res.status}`);
  return res.json();
}

async function qtDocs(term, page = 1, pagesize = 20) {
  const k = String(term || "").trim();
  if (!k) return [];
  const p = Math.max(1, Number(page) || 1);
  const n = Math.max(1, Number(pagesize) || 20);
  const key = `${k}|${p}|${n}`;
  const hit = qtDocCache.get(key);
  if (hit && Date.now() - hit.at < PAGE_TTL) return hit.docs;
  const body = await qtJson(`${QT_SEARCH}/v3/search?include=channel&k=${encodeURIComponent(k)}&page=${p}&pagesize=${n}`);
  const docs = (((body || {}).data || {}).data || {}).docs || [];
  qtDocCache.set(key, { docs, at: Date.now() });
  if (qtDocCache.size > 80) {
    const old = [...qtDocCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (old) qtDocCache.delete(old[0]);
  }
  return docs;
}

async function qtChannelBundle(chid) {
  const key = String(chid || "");
  const hit = qtChannelCache.get(key);
  if (hit && Date.now() - hit.at < PAGE_TTL) return hit.data;
  const meta = await qtJson(`${QT_API}/api/mobile/channels/${key}`);
  const ch = (meta || {}).channel || {};
  const v = String(ch.v || "");
  if (!v) throw fail("unavailable", "蜻蜓FM频道缺少版本号");
  const programs = [];
  const pages = Math.min(3, Math.max(1, Math.ceil(Number(ch.program_count || 1) / 30)));
  for (let p = 1; p <= pages; p++) {
    const d = await qtJson(`${QT_API}/api/mobile/channels/${key}/programs?version=${v}&page_index=${p}`);
    const arr = (d || {}).programs || [];
    if (!arr.length) break;
    programs.push(...arr);
  }
  const data = { channel: ch, programs };
  qtChannelCache.set(key, { data, at: Date.now() });
  return data;
}

async function qtPrograms(chid) {
  const bundle = await qtChannelBundle(chid);
  const free = bundle.programs.filter((x) => x.saleStatus === "free");
  const list = free.length ? free : bundle.programs;
  return list.slice().sort((a, b) => Number(b.programId || 0) - Number(a.programId || 0));
}

async function qtProg(chid, pid, title = "") {
  /* m.qtfm.cn 节目页已变成 SPA 空壳，音频地址由 webapi 的 programInfo 给出；
     它先回 302 再跳到带 auth_key 的签名 m4a，宿主不一定跟随，所以这里把
     location 解出来，直接把最终地址交出去。 */
  let res;
  try {
    res = await fetch(`${QT_API}/api/mobile/channels/${chid}/programs/${pid}`, { headers: QT_HEAD });
  } catch (error) {
    return null;
  }
  if (!res.ok) return null;
  let body;
  try {
    body = await res.json();
  } catch (error) {
    return null;
  }
  const info = (body && body.programInfo) || {};
  const raw = String(info.audioUrl || "").replace(/\\\//g, "/");
  if (!raw) return null;

  let url = raw;
  let redirected = false;
  try {
    const head = await fetch(url, { headers: QT_HEAD, redirect: "manual" });
    const loc = head.headers.get("location");
    if (loc) { url = new URL(loc, url).href; redirected = true; }
  } catch (error) {
    /* 解不出 302 就交原地址，宿主若会跟随也能播 */
  }

  // 付费节目也会给出 audioUrl，但跳到签名地址后返回 401。先用 HEAD 验一下
  // 最终文件，避免把必然失败的地址交给播放器。
  if (redirected && /vohwod-client-sign\.qtfm\.cn|\.m4a(?:$|\?)/i.test(url)) {
    try {
      const check = await fetch(url, { method: "HEAD", headers: QT_HEAD });
      if (!check.ok) return null;
    } catch (error) {
      return null;
    }
  }

  return { url: url, type: /\.m4a(?:$|\?)/i.test(url) ? "m4a" : "mp3", headers: { referer: QT_WEB + "/", "user-agent": "Mozilla/5.0" }, title: clean(title) };
}

async function qtChannelStream(chid, ep = 1) {
  const p = await qtPrograms(chid);
  if (!p.length) return null;
  const start = Math.min(Math.max(Number(ep) || 1, 1), p.length) - 1;
  for (let i = start; i < Math.min(p.length, start + 6); i++) {
    const r = await qtProg(chid, p[i].programId, p[i].title || "");
    if (r) return r;
  }
  return null;
}

async function qtByName(name, ep = 1) {
  const docs = await qtDocs(name);
  for (const d of docs) {
    if (!d || qtScore(d.title || "", name) < 0.3) continue;
    if (String(d.type || "").includes("channel")) {
      const r = await qtChannelStream(d.id, ep);
      if (r) return r;
    } else if (String(d.type || "").includes("program") && d.parent_id) {
      const r = await qtProg(d.parent_id, d.id, d.title || "");
      if (r) return r;
    }
  }
  return null;
}

async function qtTracks(term, limit = 16, dedupe = false) {
  const docs = await qtDocs(term, 1, Math.max(20, limit));
  return qtTracksFromDocs(docs, limit, dedupe);
}

function categoryLinks() {
  return QT_CATS.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.id)}:1` }));
}

function publisherOf(channel) {
  const text = clean((channel && channel.description) || "");
  const match = text.match(/^(.{2,24}?)(?:的|，|,|。|：|:)/);
  if (match && /广播|电台|频率|卫视|FM|节目/.test(match[1])) return match[1];
  return "蜻蜓FM";
}

function albumOfChannel(channel, chid) {
  const publisher = publisherOf(channel);
  const album = {
    id: `qtfm-ch:${chid}`,
    name: clean(channel.title || channel.name || "蜻蜓FM频道"),
    imageUrl: qtImage((channel.thumbs && channel.thumbs["800_thumb"]) || channel.cover, 800),
    artists: [{ id: "", name: publisher }],
    released: String(channel.create_time || "").slice(0, 10),
  };
  qtAlbumMeta.set(album.id, album);
  return album;
}

// ---- audio finder ----
function audioUrl(v) {
  const u = absolute(String(v || "").trim()); if (!/^https?:\/\//i.test(u)) return "";
  if (/\.(jpg|jpeg|png|gif|webp|css|js|html?|php|json)(\?|$)/i.test(u)) return "";
  if (/\.(mp3|m4a|aac|m4s|flac|ogg|wav|m3u8)(\?|#|$)/i.test(u)) return u;
  if (/audiostream|audio\.|\/audio|mp3|m4a/i.test(u)) return u;
  return "";
}
function findAudio(t) {
  const s = String(t || ""); const out = [];
  const add = (v) => { const u = audioUrl(v); if (u) out.push(u); };
  for (const m of s.matchAll(/<audio\b[^>]*>/gi)) add(attr(m[0], "src"));
  for (const m of s.matchAll(/<source\b[^>]*>/gi)) add(attr(m[0], "src"));
  for (const m of s.matchAll(/<(video|div|a)\b[^>]*>/gi)) {
    for (const n of ["data-src", "data-url", "data-audio", "data-mp3", "data-play", "data-file", "href"]) {
      if (n === "href" && !/play|listen|audio|mp3/i.test(m[0])) continue;
      add(attr(m[0], n));
    }
  }
  for (const m of s.matchAll(/(?:videourl|audioUrl|playUrl|mp3|m4a|source|src)\s*[:=]\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of s.matchAll(/https?:\/\/[^\s"'<>\\]+?\.(?:mp3|m4a|aac|m4s|flac|ogg|m3u8)(?:\?[^\s"'<>\\]*)?/gi)) add(m[0]);
  return out[0] || "";
}
function streamType(u) { return /\.m4a(?:$|\?)/i.test(u) ? "m4a" : /\.m3u8(?:$|\?)/i.test(u) ? "hls" : /\.flac(?:$|\?)/i.test(u) ? "flac" : "mp3"; }
async function detailAudio(url) {
  const pageUrl = /^https?:\/\//.test(url) ? url : absolute(url);
  const page = await html(pageUrl);
  const a = findAudio(page); if (a) return { url: a, referer: pageUrl };
  for (const m of page.matchAll(/<iframe\b[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
    const inner = await html(absolute(m[1])); const x = findAudio(inner); if (x) return { url: x, referer: absolute(m[1]) };
  }
  return null;
}

// ---- ting55 nlinka ----
async function ting55Audio(url) {
  let page = await html(url);
  let book = (page.match(/meta\s+name="_b"\s+content="([^"]+)"/i) || [])[1];
  let pageNo = (page.match(/meta\s+name="_cp"\s+content="([^"]+)"/i) || [])[1];
  if (!book) { const b = page.match(/\/book\/([0-9]+)/); book = b && b[1]; }
  if (!pageNo) { const c = page.match(/\/book\/[0-9]+-([0-9]+)/); pageNo = c && c[1]; }
  if (book && !pageNo) {
    page = await html(`/book/${book}-1`);
    pageNo = (page.match(/meta\s+name="_cp"\s+content="([^"]+)"/i) || [])[1] || "1";
  }
  if (!book) return null;
  if (!pageNo) pageNo = "1";
  const xt = (page.match(/meta\s+name="_c"\s+content="([^"]+)"/i) || [])[1] || "";
  const l = (page.match(/meta\s+name="_l"\s+content="([^"]+)"/i) || [])[1] || "1";
  const res = await fetch(BASE + "/nlinka", { method: "POST", headers: { "user-agent": UA, referer: absolute(url), "content-type": "application/x-www-form-urlencoded", xt, l }, body: `bookId=${encodeURIComponent(book)}&isPay=0&page=${encodeURIComponent(pageNo)}` });
  if (!res.ok) return null;
  const data = await res.json();
  const u = data.ourl || data.url;
  if (!u) return null;
  return { url: absolute(u), referer: absolute(url) };
}

async function missevanAudio(url) {
  const m = String(url).match(/sound\/([0-9]+)|soundid=([0-9]+)/);
  if (!m) return null;
  const id = m[1] || m[2];
  const res = await fetch(`https://www.missevan.com/sound/getsound?soundid=${id}`, { headers: { "user-agent": UA, referer: "https://www.missevan.com/" } });
  if (!res.ok) return null;
  const data = await res.json();
  const snd = (((data || {}).info || {}).sound) || {};
  const u = snd.soundurl_128 || snd.soundurl || snd.videourl;
  if (!u) return null;
  return { url: u, referer: "https://www.missevan.com/" };
}

// ---- exports ----
const HOME_SECTIONS = [
  { title: "推荐电台", query: "电台", limit: 14 },
  { title: "音乐电台", query: "音乐", limit: 8 },
  { title: "资讯电台", query: "资讯", limit: 8 },
  { title: "情感电台", query: "情感", limit: 8 },
];

export async function home() {
  const results = await Promise.allSettled(HOME_SECTIONS.map((x) => qtDocs(x.query, 1, 20)));
  const sections = [];
  let firstDocs = null;
  results.forEach((result, index) => {
    if (result.status !== "fulfilled" || !result.value.length) return;
    const def = HOME_SECTIONS[index];
    if (!firstDocs) firstDocs = result.value;
    const albums = qtAlbumsFromDocs(result.value, def.limit);
    if (albums.length) sections.push({ title: def.title, albums, empty: "这里暂时没有频道" });
  });

  let tracks = [];
  if (firstDocs) tracks = qtTracksFromDocs(firstDocs, 12, true);
  if (!tracks.length) {
    try { tracks = await qtTracks("电台", 12, true); } catch (e) {}
  }
  if (tracks.length) sections.push({ title: "热门节目", tracks, morePage: "popular", empty: "这里暂时没有节目" });

  sections.push({ title: "按类型发现", links: categoryLinks() });
  return {
    title: "听FM电台",
    subtitle: "蜻蜓FM 频道与节目",
    description: "按频道聚合推荐，点进频道查看最新节目；播放时解析蜻蜓FM 的签名 m4a 直链。",
    sections,
  };
}

export async function browse({ page }) {
  const raw = String(page || "");

  if (raw === "home") return home();

  if (!raw || raw === "categories") {
    return {
      title: "电台分类",
      subtitle: QT_CATS.length + " 个分类",
      sections: [
        { title: "全部分类", links: categoryLinks() },
        { title: "返回", links: [{ title: "返回首页", page: "home" }] },
      ],
    };
  }

  if (raw === "popular") {
    const settled = await Promise.allSettled([qtDocs("电台", 1, 20), qtDocs("电台", 2, 20)]);
    const docs = settled.flatMap((x) => x.status === "fulfilled" ? x.value : []);
    const tracks = qtTracksFromDocs(docs, 40, false);
    return {
      title: "热门节目",
      subtitle: tracks.length + " 个节目",
      sections: [
        { title: "热门节目", tracks, empty: "这里暂时没有节目" },
        { title: "返回", links: [{ title: "返回首页", page: "home" }, { title: "全部分类", page: "categories" }] },
      ],
    };
  }

  const m = raw.match(/^cat:([^:]+):(\d+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const cat = QT_CATS.find((c) => c.id === id);
    if (!cat) throw fail("unavailable", "没有这个分类");
    const p = Math.max(1, Number(m[2]) || 1);
    const docs = await qtDocs(cat.query, p, 20);
    const albums = qtAlbumsFromDocs(docs, 20);
    const links = [];
    if (p > 1) links.push({ title: "上一页", page: `cat:${encodeURIComponent(cat.id)}:${p - 1}` });
    if (docs.length >= 20) links.push({ title: "下一页", page: `cat:${encodeURIComponent(cat.id)}:${p + 1}` });
    links.push({ title: "全部分类", page: "categories" });
    return {
      title: cat.name + (p > 1 ? " · 第 " + p + " 页" : ""),
      subtitle: albums.length + " 个频道",
      sections: [
        { title: cat.name, albums, empty: "这个分类暂时没有频道" },
        { title: "翻页", links },
      ],
    };
  }

  throw fail("unavailable", "没有这个页面");
}

export async function search({ query, kind = "tracks", offset = 0 }) {
  const term = String(query || "").trim();
  if (!term) return { tracks: [], albums: [], more: false };
  const page = Math.max(1, Math.floor(Number(offset || 0) / 20) + 1);
  const docs = await qtDocs(term, page, 20);
  const more = docs.length >= 20;
  if (kind === "albums") return { albums: qtAlbumsFromDocs(docs, 30), more };
  if (kind === "tracks" || kind === "track") return { tracks: qtTracksFromDocs(docs, 40, false), more };
  if (kind === "artists") return { artists: [], more: false };
  return { tracks: [], more: false };
}

export async function suggest({ query }) {
  try {
    const docs = await qtDocs(String(query || ""), 1, 10);
    const names = [], seen = new Set();
    for (const d of docs) {
      const name = clean(d.title || d.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names.slice(0, 8);
  } catch (e) { return []; }
}

export async function album({ id }) {
  const raw = String(id || "");
  const match = raw.match(/^qtfm-ch:(\d+)$/);
  if (!match) throw fail("unavailable", "没有这张电台专辑");
  const chid = match[1];
  const bundle = await qtChannelBundle(chid);
  const channel = bundle.channel || {};
  const meta = albumOfChannel(channel, chid);
  const publisher = (meta.artists && meta.artists[0] && meta.artists[0].name) || "蜻蜓FM";
  const list = bundle.programs.slice(0, 60);
  const tracks = list.map((p) => ({
    id: `qtfm-prog:${chid}:${p.programId}`,
    name: clean(p.title || "未命名节目"),
    artists: [{ id: "", name: publisher }],
    album: meta,
    duration: Number(p.duration || 0) * 1000,
    unavailable: p.saleStatus !== "free",
  }));
  if (!tracks.length) throw fail("unavailable", "这个频道暂时没有可播放的节目");
  remember(tracks);
  return { album: meta, tracks };
}

export async function stream({ id }) {
  const raw = String(id || "");
  const prog = raw.match(/^qtfm-prog:(\d+):(\d+)$/);
  if (prog) { const t = trackBy(raw); const r = await qtProg(prog[1], prog[2], t ? t.name : ""); if (!r) throw fail("unavailable", "蜻蜓FM兜底音频暂时取不到"); return r; }
  const qt = raw.match(/^qtfm:(\d+):(\d+)$/);
  if (qt) { const r = await qtChannelStream(qt[1], Number(qt[2]) || 1); if (!r) throw fail("unavailable", "蜻蜓FM兜底音频暂时取不到"); return r; }

  const track = trackBy(raw);
  const url = (track && track._detail) || raw;
  let r = null;
  try {
    if (CFG.mode === "ting55") r = await ting55Audio(url);
    else if (CFG.mode === "missevan") r = await missevanAudio(url);
    else r = await detailAudio(url);
  } catch (e) { r = null; }
  if (r) return { url: r.url, type: streamType(r.url), headers: { referer: r.referer || REFERER, "user-agent": UA }, title: track ? track.name : "" };

  if (track && track.name) { const fb = await qtByName(track.name, 1); if (fb) return fb; }
  throw fail("unavailable", "这段音频暂时播不了：源站地址未解析到，蜻蜓FM也没有找到同名音频");
}

export function lyrics() { return {}; }
export function like({ id, on }) {
  const k = String(id), ids = new Set(stored("liked", [])), data = stored("likedTracks", {});
  if (on) { ids.add(k); const t = trackBy(k); if (t) { data[k] = t; keep("likedTracks", data); } } else ids.delete(k);
  keep("liked", [...ids]);
}
export function isLiked({ ids }) { const s = new Set(stored("liked", [])); const o = {}; for (const id of ids) o[id] = s.has(String(id)); return o; }
export function liked({ offset = 0 }) { const ids = stored("liked", []).slice().reverse(); const d = stored("likedTracks", {}); const t = ids.map((id) => d[id]).filter(Boolean).slice(offset, offset + 60); return { tracks: t, more: ids.length > offset + 60 }; }
export function played({ id }) {
  const k = String(id), h = stored("history", []).filter((x) => x !== k); h.push(k); keep("history", h.slice(-40));
  const t = knownTracks.get(k); if (t) { const d = stored("historyTracks", {}); d[k] = t; for (const o of Object.keys(d)) if (!h.slice(-40).includes(o)) delete d[o]; keep("historyTracks", d); }
}
export function recent() { const ids = stored("history", []).slice(-40).reverse(); const d = stored("historyTracks", {}); return ids.map((id) => d[id] || knownTracks.get(id)).filter(Boolean).slice(0, 20); }
