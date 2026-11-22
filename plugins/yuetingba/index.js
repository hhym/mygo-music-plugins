const CFG = {
  "name": "悦听吧",
  "base": "http://www.yuetingba.cn",
  "mode": "yuetingba",
  "seed": "有声小说",
  "detail": "/book/detail/[0-9a-fA-F-]+/[0-9]+",
  "homePath": "/",
  "searchPath": "/search?type=1&name={q}&pageIndex=1",
  "cats": [
    {
      "id": "1",
      "name": "玄幻",
      "path": "/book/{id}/1"
    },
    {
      "id": "4",
      "name": "都市",
      "path": "/book/{id}/1"
    },
    {
      "id": "2",
      "name": "历史",
      "path": "/book/{id}/1"
    },
    {
      "id": "6",
      "name": "名著",
      "path": "/book/{id}/1"
    },
    {
      "id": "7",
      "name": "女频",
      "path": "/book/{id}/1"
    },
    {
      "id": "5",
      "name": "科幻",
      "path": "/book/{id}/1"
    },
    {
      "id": "3",
      "name": "武侠",
      "path": "/book/{id}/1"
    },
    {
      "id": "a",
      "name": "评书",
      "path": "/book/{id}/1"
    },
    {
      "id": "8",
      "name": "社科",
      "path": "/book/{id}/1"
    }
  ],
  "subtitle": "海量听书资源"
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

const pageCache = new Map();
const knownTracks = new Map();
const qtChannelCache = new Map();

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

function albumCards(list) {
  return (list || []).map((t) => ({
    id: albumIdOf((t.album && t.album.id) || t.id),
    name: t.name,
    imageUrl: (t.album && t.album.imageUrl) || "",
    artists: t.artists || [],
  })).filter((a) => a.id);
}

function maxBookPage(html, catId) {
  let max = 1;
  const re = new RegExp(`/book/${catId}/([0-9]+)`, "g");
  for (const m of String(html).matchAll(re)) max = Math.max(max, Number(m[1]) || 1);
  return max;
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

// ---- qtfm fallback ----
function qtCore(n) { return String(n || "").replace(/[《》<>【】\[\]（）()：:·\-—_、，,。.!！?？\s]/g, "").replace(/(长篇|短篇|袍带|评书|有声|小说|经典|全集|在线听|mp3)/gi, ""); }
function qtScore(a, b) { const x = [...qtCore(a)], y = new Set([...qtCore(b)]); if (!x.length || !y.size) return 0; let c = 0; for (const ch of x) if (y.has(ch)) c++; return c / Math.max(x.length, y.size); }
async function qtJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile", origin: QT_WEB, referer: QT_WEB + "/", accept: "application/json,*/*" } });
  if (!res.ok) throw fail("unavailable", `蜻蜓FM ${res.status}`);
  return res.json();
}
async function qtDocs(term) {
  const k = String(term || "").trim(); if (!k) return [];
  const body = await qtJson(`${QT_SEARCH}/v3/search?include=channel&k=${encodeURIComponent(k)}&page=1&pagesize=20`);
  return (((body || {}).data || {}).data || {}).docs || [];
}
async function qtPrograms(chid) {
  const meta = await qtJson(`${QT_API}/api/mobile/channels/${chid}`);
  const ch = (meta || {}).channel || {}; const v = String(ch.v || ""); if (!v) return [];
  const list = [];
  for (let p = 1; p <= Math.min(4, Math.ceil(Number(ch.program_count || 0) / 30) || 1); p++) {
    const d = await qtJson(`${QT_API}/api/mobile/channels/${chid}/programs?version=${v}&page_index=${p}`);
    const arr = (d || {}).programs || []; if (!arr.length) break; list.push(...arr);
  }
  const free = list.filter((x) => x.isFree === true || x.saleStatus === "free" || Number(x.fee) === 0);
  return (free.length ? free : list).sort((a, b) => Number(a.programId || 0) - Number(b.programId || 0));
}
async function qtProg(chid, pid, title = "") {
  const res = await fetch(`${QT_WEB}/vchannels/${chid}/programs/${pid}/`, { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile", referer: QT_WEB + "/" } });
  if (!res.ok) return null;
  const t = await res.text(); if (/用户未购买/.test(t)) return null;
  const m = t.match(/"audioUrl":"(https?:\/\/[^"]+)"/); if (!m) return null;
  const u = m[1].replace(/\\\//g, "/");
  return { url: u, type: /\.m4a(?:$|\?)/.test(u) ? "m4a" : "mp3", headers: { referer: QT_WEB + "/", "user-agent": "Mozilla/5.0" }, title: clean(title) };
}
async function qtChannelStream(chid, ep = 1) { const p = await qtPrograms(chid); if (!p.length) return null; const i = Math.min(Math.max(Number(ep) || 1, 1), p.length) - 1; return qtProg(chid, p[i].programId, p[i].title || ""); }
async function qtByName(name, ep = 1) {
  const docs = await qtDocs(name);
  for (const d of docs) {
    if (!d || qtScore(d.title || "", name) < 0.3) continue;
    if (String(d.type || "").includes("channel")) { const r = await qtChannelStream(d.id, ep); if (r) return r; }
    else if (String(d.type || "").includes("program") && d.parent_id) { const r = await qtProg(d.parent_id, d.id, d.title || ""); if (r) return r; }
  }
  return null;
}
async function qtTracks(term, limit = 16, dedupe = false) {
  const docs = await qtDocs(term); const out = [], seen = new Set(), albums = new Set();
  for (const d of docs) {
    if (out.length >= limit) break; if (!d || !d.id) continue;
    const typ = String(d.type || ""); const isCh = typ.includes("channel"); const isProg = typ.includes("program") && d.parent_id;
    if (!isCh && !isProg) continue;
    const id = isProg ? `qtfm-prog:${d.parent_id}:${d.id}` : `qtfm:${d.id}:1`;
    const alb = d.parent_id ? String(d.parent_id) : String(d.id);
    if (seen.has(id) || (dedupe && albums.has(alb))) continue;
    seen.add(id); albums.add(alb);
    const cover = d.cover || d.coverUrl || d.thumbnail || "";
    const t = makeTrack(id, d.title || d.name || "有声节目", { artists: [{ name: d.podcaster || d.nickname || "蜻蜓FM", id: "" }], album: { id: `qtfm:${alb}`, name: "蜻蜓FM 兜底", imageUrl: absolute(cover).replace(/^http:/i, "https:") } });
    knownTracks.set(String(t.id), t); out.push(t);
  }
  return out;
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

async function yuetingbaAudio(url) {
  let page = "";
  let m = String(url).match(/\/book\/ting\/([0-9a-fA-F-]+)/);
  if (!m) {
    page = await html(url);
    const c = page.match(/href="\/book\/ting\/([0-9a-fA-F-]+)"/);
    if (!c) return null;
    m = c;
  }
  const res = await fetch(`${BASE}/api/app/docs-listen/${m[1]}/audio-url`, { headers: { "user-agent": UA, referer: absolute(url) } });
  if (!res.ok) return null;
  const u = (await res.text()).trim();
  if (!/^https?:/i.test(u)) return null;
  return { url: u, referer: absolute(url) };
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
export async function home() {
  const sections = [];
  if (CFG.mode !== "qtfm") {
    try {
      const list = parseList(await html(CFG.homePath || "/"));
      if (list.length) {
        remember(list);
        sections.push({ title: "最新更新", tracks: list.slice(0, 30), albums: albumCards(list.slice(0, 30)), pageTitle: CFG.name });
        if (CATS.length) sections.push({ title: "分类与专辑库", links: [{ title: "全部专辑", page: "all:1" }, ...CATS.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.id)}:1` }))] });
        return { title: CFG.name, subtitle: CFG.subtitle || "", sections };
      }
    } catch (e) {}
  }
  const fallback = await qtTracks(CFG.seed || "有声小说", 16, true);
  if (fallback.length) sections.push({ title: "推荐收听", subtitle: "源站暂时不可用，以下为蜻蜓FM同书兜底", tracks: fallback, pageTitle: "蜻蜓FM" });
  if (CATS.length) sections.push({ title: "分类", links: CATS.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.id)}:1` })) });
  return { title: CFG.name, subtitle: CFG.subtitle || "", sections };
}

export async function browse({ page }) {
  const raw = String(page || "");
  if (raw === "categories" || !raw) return { title: `${CFG.name}分类`, sections: [{ title: "分类", links: CATS.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.id)}:1` })) }] };
  const all = raw.match(/^all:(\d+)$/);
  if (all) {
    const pageNo = Math.max(1, Number(all[1]) || 1);
    const list = []; const seen = new Set(); let maxPage = pageNo;
    for (const c of CATS) {
      try {
        const page = await html(`/book/${encodeURIComponent(c.id)}/${pageNo}`);
        maxPage = Math.max(maxPage, maxBookPage(page, encodeURIComponent(c.id)));
        for (const t of parseList(page)) if (!seen.has(t.id)) { seen.add(t.id); list.push(t); }
      } catch (e) {}
    }
    remember(list);
    return {
      title: "全部专辑",
      subtitle: `第 ${pageNo} 页`,
      sections: [{ title: `全部专辑 · 第 ${pageNo} 页`, tracks: list, albums: albumCards(list), morePage: pageNo < maxPage ? { page: `all:${pageNo + 1}`, pageTitle: "全部专辑" } : undefined, empty: list.length ? "" : "这一页没有内容" }],
    };
  }
  const m = raw.match(/^cat:([^:]+):(\d+)$/); if (!m) throw fail("unavailable", "没有这个页面");
  const cat = CATS.find((c) => String(c.id).toLowerCase() === decodeURIComponent(m[1]).toLowerCase());
  if (!cat) throw fail("unavailable", "没有这个分类");
  const pageNo = Math.max(1, Number(m[2]) || 1);
  let list = []; let maxPage = pageNo;
  try {
    const page = await html((cat.path || `/book/${cat.id}/{page}`).replace("{id}", encodeURIComponent(cat.id)).replace("{page}", pageNo));
    list = parseList(page); maxPage = maxBookPage(page, encodeURIComponent(cat.id));
  } catch (e) {}
  if (list.length) {
    remember(list);
    return { title: cat.name, subtitle: `第 ${pageNo} 页`, sections: [{ title: `${cat.name} · 第 ${pageNo} 页`, tracks: list, albums: albumCards(list), morePage: pageNo < maxPage ? { page: `cat:${encodeURIComponent(cat.id)}:${pageNo + 1}`, pageTitle: cat.name } : undefined }, { title: "分类", links: [{ title: "全部专辑", page: "all:1" }, ...CATS.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.id)}:1` }))] }] };
  }
  const fb = await qtTracks(cat.query || cat.name, 16, true);
  return { title: cat.name, subtitle: "源站暂时不可用，以下为蜻蜓FM兜底", sections: [{ title: cat.name, subtitle: "蜻蜓FM 兜底", tracks: fb }, { title: "分类", links: [{ title: "全部专辑", page: "all:1" }, ...CATS.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.id)}:1` }))] }] };
}

export async function search({ query, kind = "tracks", offset = 0 }) {
  if (kind && kind !== "tracks" && kind !== "track" && kind !== "albums") return { tracks: [], more: false };
  const term = String(query || "").trim(); if (!term) return { tracks: [], more: false };
  if (CFG.searchPath) {
    try {
      const list = parseList(await html(CFG.searchPath.replace("{q}", encodeURIComponent(term))));
      if (list.length) { remember(list); return { tracks: list, albums: albumCards(list), more: false }; }
    } catch (e) {}
  }
  return { tracks: await qtTracks(term, 20), more: false };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try { return ((await search({ query: term, kind: "albums" })).albums || []).slice(0, 8).map((a) => a.name); } catch (e) { return []; }
}

export async function stream({ id }) {
  const raw = String(id || "");
  const prog = raw.match(/^qtfm-prog:(\d+):(\d+)$/);
  if (prog) { const r = await qtProg(prog[1], prog[2]); if (!r) throw fail("unavailable", "蜻蜓FM兜底音频暂时取不到"); return r; }
  const qt = raw.match(/^qtfm:(\d+):(\d+)$/);
  if (qt) { const r = await qtChannelStream(qt[1], Number(qt[2]) || 1); if (!r) throw fail("unavailable", "蜻蜓FM兜底音频暂时取不到"); return r; }

  const track = trackBy(raw);
  const url = (track && track._detail) || raw;
  let r = null;
  try {
    if (CFG.mode === "ting55") r = await ting55Audio(url);
    else if (CFG.mode === "missevan") r = await missevanAudio(url);
    else if (CFG.mode === "yuetingba") r = await yuetingbaAudio(url);
    else r = await detailAudio(url);
  } catch (e) { r = null; }
  if (r) return { url: r.url, type: streamType(r.url), headers: { referer: r.referer || REFERER, "user-agent": UA }, title: track ? track.name : "" };

  if (track && track.name) { const fb = await qtByName(track.name, 1); if (fb) return fb; }
  throw fail("unavailable", "这段音频暂时播不了：源站地址未解析到，蜻蜓FM也没有找到同名音频");
}

function albumIdOf(id) {
  const s = String(id || "");
  const m = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  return m ? m[0] : "";
}

export async function album({ id } = {}) {
  const bid = albumIdOf(id);
  if (!bid) throw fail("unavailable", "没有这个专辑");
  const first = await html(`/book/detail/${bid}/0`);
  const name = clean((first.match(/<h1[^>]*class="[^"]*book-detail-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || first.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1]) || "未命名专辑";
  const img = first.match(/<div class="books-detail-img">[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
  const author = clean((first.match(/作\s*者：<\/span><span[^>]*>(?:<a[^>]*>)?([^<]+)</i) || [])[1]);
  const speaker = clean((first.match(/演\s*播：<\/span>[\s\S]*?<a[^>]*>([^<]+)</i) || [])[1]);
  const di = first.indexOf("内容简介");
  const dseg = di >= 0 ? first.slice(di, di + 6000) : "";
  const dm = dseg.match(/<div[^>]*class="[^"]*text-desc-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const desc = clean(((dm || [])[1] || "").replace(/<br\s*\/>/gi, "\n").replace(/<[^>]+>/g, ""));

  let maxOffset = 0;
  for (const m of first.matchAll(new RegExp(`/book/detail/${bid}/([0-9]+)`, "g"))) maxOffset = Math.max(maxOffset, Number(m[1]) || 0);

  const tracks = []; const seen = new Set();
  for (let off = 0; off <= maxOffset; off += 200) {
    const page = off === 0 ? first : await html(`/book/detail/${bid}/${off}`);
    const re = /<div id="item_([0-9a-fA-F-]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    for (const m of page.matchAll(re)) {
      const cid = m[1];
      if (seen.has(cid)) continue; seen.add(cid);
      const tm = m[2].match(/<a[^>]+(?:title="([^"]*)")?[^>]+href="\/book\/ting\/[0-9a-fA-F-]+"[^>]*>([^<]*)<\/a>/);
      const cname = clean((tm && (tm[1] || tm[2])) || "");
      tracks.push({
        id: `/book/ting/${cid}`,
        name: cname || `第 ${tracks.length + 1} 集`,
        artists: [{ id: "", name: speaker }].filter((a) => a.name),
        album: { id: bid, name, imageUrl: img ? absolute(img[1]) : "" },
        duration: 0,
      });
    }
  }

  return {
    album: { id: bid, name, imageUrl: img ? absolute(img[1]) : "", artists: [{ id: "", name: author }, { id: "", name: speaker }].filter((a) => a.name), description: desc },
    tracks,
  };
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
