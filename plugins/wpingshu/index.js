// 显示名：娓雅评书（wpingshu）
// 站点 https://www.wpingshu.com/ —— 帝国 CMS + AMP 模板的评书站。
// 目录按「评书者」分：/stfps/ 单田芳、/ykcps/ 袁阔成、/llrps/ 连丽如、/llfps/ 刘兰芳、
// /tlyps/ 田连元、/tzyps/ 田战义、/zszps/ 张少佐。书页 /<分类>/<书名拼音>/（个别成套
// 书是两段 /llfps/llfps/plh75h/），集页 /<分类>/<书名>/<集号>.html。
//
// 音频不在页面里：集页只给 var articleId = "29027"，播放脚本（被塞进
// templets/ps/js/jquery-1.3.2.min.js 里）按下标算出 /api/<拼出来的号>.html 再取 JSON：
//   q1 = 首位数 + 1，q2 = 末位数 + 3，q6 = articleId + 250011
//   /api/ + q1 + q6 + "3" + q2 + ".html"
// 返回 [{"body":"<audio><source src=\"https://aod.cos.tx.xmcdn.com/...m4a\"/></audio>"}]，
// 即喜马拉雅 xmcdn 的 m4a（脚本里还会把 .flv 换成 .mp3）。
const CFG = {
  id: "wpingshu",
  name: "娓雅评书",
  base: "https://www.wpingshu.com",
  subtitle: "连丽如、单田芳、袁阔成、刘兰芳、田连元等评书在线收听",
};

const BASE = CFG.base;
const REFERER = BASE + "/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PAGE_TTL = 5 * 60 * 1000;
const INDEX_TTL = 30 * 60 * 1000;

/* 路径形态：/{分类}/{书名}/ 或 /{分类}/{子套}/{书名}/；集页末尾是 /{集号}.html */
const CAT_RE = /^\/([a-z0-9]{4,8})\/$/;
const BOOK_RE = /^\/([a-z0-9]{4,8})\/(?:([a-z0-9]{2,10})\/)?([a-z0-9]{1,30})\/$/;
const EP_RE = /^\/([a-z0-9]{4,8})\/(?:([a-z0-9]{2,10})\/)?([a-z0-9]{1,30})\/(\d{1,7})\.html$/;

const CATS_FALLBACK = [
  { id: "stfps", name: "单田芳" },
  { id: "ykcps", name: "袁阔成" },
  { id: "llrps", name: "连丽如" },
  { id: "llfps", name: "刘兰芳" },
  { id: "tlyps", name: "田连元" },
  { id: "tzyps", name: "田战义" },
  { id: "zszps", name: "张少佐" },
];

const pageCache = new Map();
const knownTracks = new Map();

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}
function stored(k, f) {
  const v = host.storage.get(k);
  return v === undefined || v === null ? f : v;
}
function keep(k, v) {
  host.storage.set(k, v);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function unescapeHtml(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, n) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n])
    .replace(/&[a-zA-Z]+;/g, " ");
}
function clean(s) {
  return unescapeHtml(String(s || "").replace(/<[^>]+>/g, " ")).replace(/[\s\u00a0]+/g, " ").trim();
}
function absolute(u) {
  if (!u) return "";
  let x = String(u).trim().replace(/\\\//g, "/");
  if (x.startsWith("//")) return "https:" + x;
  if (x.startsWith("/")) return BASE + x;
  return x;
}
function attr(tag, name) {
  const r = new RegExp(name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
  const m = r.exec(tag);
  return m ? (m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]) : "";
}
function imageFrom(html) {
  const s = String(html || "");
  const all = [];
  for (const m of [...s.matchAll(/<(?:amp-img|img)\b([^>]*?)>/gi)]) {
    const src = attr(m[1], "data-original") || attr(m[1], "data-src") || attr(m[1], "src");
    if (!src || /nocover|noimage|blank|loading|lazy\.gif|placeholder|logo/i.test(src)) continue;
    all.push(absolute(src));
  }
  /* 封面都在 /uploads/ 下，header 的 logo.webp 不算 */
  const cover = all.find((u) => /\/uploads\//i.test(u)) || all.find((u) => /\.(jpg|jpeg|png|webp)/i.test(u));
  return cover || "";
}
function makeTrack(id, name, extra) {
  const e = extra || {};
  return {
    id: String(id),
    name: clean(name),
    artists: e.artists || [],
    album: e.album || { id: "", name: "", imageUrl: "" },
    duration: 0,
  };
}
function remember(list) {
  for (const t of list || []) if (t && t.id) knownTracks.set(String(t.id), t);
}
function trackBy(id) {
  return knownTracks.get(String(id)) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null;
}

/* 站点回源不稳，503/520 常见，页面请求统一重试 3 次 */
async function request(path, options) {
  const o = options || {};
  const url = path.startsWith("http") ? path : BASE + path;
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        method: o.method || "GET",
        headers: {
          "user-agent": UA,
          referer: o.referer || REFERER,
          "accept-language": "zh-CN,zh;q=0.9",
          accept: o.accept || "text/html,*/*",
        },
        body: o.body,
      });
      if (res.ok) return res;
      lastErr = fail("unavailable", BASE + " 返回了 " + res.status + "（" + (path.length > 50 ? path.slice(0, 50) + "…" : path) + "）");
      if (res.status !== 403 && res.status !== 429) {
        /* 404 不重试，其余抖动重试 */
        if (res.status >= 500) {
          await sleep(1500 * (i + 1));
          continue;
        }
      }
      throw lastErr;
    } catch (e) {
      lastErr = e && e.code ? e : fail("unavailable", "连不上 " + BASE + "：" + (e && e.message ? e.message : e));
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr || fail("unavailable", "连不上 " + BASE);
}

async function html(path, options) {
  const o = options || {};
  const key = (path.startsWith("http") ? path : BASE + path) + "|" + (o.referer || "");
  const cached = pageCache.get(key);
  if (cached && Date.now() - cached.at < PAGE_TTL) return cached.text;
  const res = await request(path, o);
  const text = await res.text();
  if (/Web server is returning an unknown error|upstream connect error/i.test(text) && text.length < 9000) {
    throw fail("unavailable", "站点回源错误（" + BASE + " 520/503）");
  }
  pageCache.set(key, { text, at: Date.now() });
  if (pageCache.size > 80) {
    const oldest = [...pageCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) pageCache.delete(oldest[0]);
  }
  return text;
}

/* ---------------------------------------------------------------- 解析 */

function navCats(page) {
  const s = String(page || "");
  const nav = (s.match(/<nav\b[\s\S]{0,900}?<\/nav>/i) || [])[0] || "";
  const out = [];
  const seen = new Set();
  for (const m of nav.matchAll(/<a\b([^>]*)>([^<]{1,12})<\/a>/gi)) {
    const href = attr(m[1], "href");
    const id = (CAT_RE.exec(href) || [])[1];
    if (!id || seen.has(id)) continue;
    if (/^(首页|阅读记录|history)$/i.test(clean(m[2]))) continue;
    seen.add(id);
    out.push({ id: id, name: clean(m[2]) });
  }
  return out;
}

let catCache = null;
async function categories() {
  if (catCache && catCache.length) return catCache;
  const fallback = stored("cats", null);
  let cats = [];
  try {
    cats = navCats(await html("/"));
  } catch (e) {
    cats = [];
  }
  /* nav 里只有几位常见的，张少佐/刘兰芳常常不在导航上，用兜底表补齐 */
  const pool = (fallback && fallback.length ? fallback : CATS_FALLBACK).slice();
  const merged = cats.slice();
  for (const c of pool) if (!merged.some((x) => x.id === c.id)) merged.push(c);
  cats = merged;
  if (cats.length) {
    catCache = cats;
    keep("cats", cats);
  } else {
    catCache = CATS_FALLBACK.slice();
  }
  return catCache;
}
function catName(id) {
  const c = (catCache || CATS_FALLBACK).find((x) => x.id === id);
  return c ? c.name : "评书";
}
function catLinks() {
  return (catCache || CATS_FALLBACK).map((c) => ({ title: c.name, page: "cat:" + c.id + ":1" }));
}

/* 首页/分类页的书卡：<div class="outdiv"> 或 <div class="category-div">，块内 h3 是书名 */
function bookBlocks(page, limit) {
  const s = String(page || "");
  const out = [];
  const seen = new Set();
  const starts = [];
  for (const m of s.matchAll(/<div class="(?:outdiv|category-div)"/gi)) starts.push(m.index || 0);
  if (!starts.length) starts.push(0);
  for (let i = 0; i < starts.length; i++) {
    const chunk = s.slice(starts[i], starts[i + 1] || s.length);
    const nameM = /<h3>([\s\S]{0,120}?)<\/h3>/.exec(chunk);
    if (!nameM) continue;
    const name = clean(nameM[1]);
    if (!name || name.length < 2) continue;
    let path = "";
    for (const a of chunk.matchAll(/<a\b([^>]*)>/gi)) {
      const href = attr(a[1], "href");
      if (BOOK_RE.test(href)) {
        path = href;
        break;
      }
    }
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const spanM = /<span>([^<]{1,20})<\/span>/.exec(chunk);
    const anchor = spanM ? clean(spanM[1]) : "";
    const introM = /<div class="intro[^"]*">([\s\S]{0,400}?)<\/div>/.exec(chunk);
    const intro = introM ? clean(introM[1]).replace(/^介绍：/, "") : "";
    const cover = imageFrom(chunk);
    const track = makeTrack(path, name, {
      artists: anchor ? [{ name: anchor, id: "" }] : [],
      album: { id: path, name: name, imageUrl: cover },
    });
    track.intro = intro;
    knownTracks.set(String(track.id), track);
    out.push(track);
    if (limit && out.length >= limit) break;
  }
  return out;
}

/* 书页：h1 书名、封面 amp-img、评书者、状态、简介、章节列表（info-chapters 块） */
async function bookInfo(path) {
  const page = await html(path);
  const title = clean((page.match(/<h1>([\s\S]{0,120}?)<\/h1>/) || [])[1] || (page.match(/<title>([^<|_]+)/) || [])[1] || "");
  const cover = imageFrom(page) || (page.match(/\/uploads\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/i) || [])[0] || "";
  const anchor = clean((page.match(/评书者：([^<]{1,20})/) || [])[1] || "");
  const status = clean((page.match(/状\s*态：([^<，,。]{1,10})/) || [])[1] || "");
  const introM = /<div class="info-main-intro">([\s\S]{0,3000}?)<\/div>/.exec(page);
  let desc = introM ? clean(introM[1]) : "";
  if (!desc) desc = clean((page.match(/<meta\s+name="description"\s+content="([^"]+)"/i) || [])[1] || "");
  desc = desc.replace(/^[^\s，,]*简介：/, "");
  const chapters = [];
  const seen = new Set();
  /* 页面里有两块章节区：先「最新章节」（倒序几条），后「目录」（正序全量），取后者 */
  const zone =
    (/<div class="info-chapters-title"><strong>[^<]{0,60}目录<\/strong><\/div>\s*<div class="info-chapters[^"]*">([\s\S]*?)<\/ul>/.exec(page) || [])[1] ||
    (/<div class="info-chapters[^"]*">([\s\S]*?)<\/ul>/.exec(page) || [])[1] ||
    page;
  for (const m of zone.matchAll(/<a\b([^>]*)>([^<]{1,40})<\/a>/gi)) {
    const href = attr(m[1], "href");
    if (!EP_RE.test(href) || seen.has(href)) continue;
    seen.add(href);
    chapters.push({ path: href, name: clean(m[2]) || clean(attr(m[1], "title")) });
  }
  return { title: title || "未命名", cover: absolute(cover), anchor: anchor, status: status, desc: desc, chapters: chapters };
}

function chaptersToTracks(path, info) {
  return info.chapters.map((c, i) =>
    makeTrack(c.path, c.name || "第 " + (i + 1) + " 集", {
      album: { id: path, name: info.title, imageUrl: info.cover },
      artists: info.anchor ? [{ name: info.anchor, id: "" }] : [],
    })
  );
}

/* 集页只给 articleId，音频号要把各位数字按站内脚本的规则拼出来 */
function apiPathOf(articleId) {
  const s = String(articleId);
  if (!/^\d{4,7}$/.test(s)) return "";
  const q1 = parseInt(s.slice(0, 1), 10) + 1;
  const q2 = parseInt(s.slice(-1), 10) + 3;
  const q6 = parseInt(s, 10) + 250011;
  return "/api/" + q1 + q6 + "3" + q2 + ".html";
}

async function audioOf(path) {
  const page = await html(path);
  const aid = (page.match(/var\s+articleId\s*=\s*["'](\d+)["']/) || [])[1];
  if (!aid) {
    /* 少数页直接内嵌音频 */
    const direct = (page.match(/https?:[^\s"'<>\\]+\.(?:m4a|mp3)(?:\?[^\s"'<>\\]*)?/i) || [])[0];
    if (direct) return { url: direct, referer: BASE + path };
    return null;
  }
  const api = apiPathOf(aid);
  if (!api) return null;
  const res = await request(api, { referer: BASE + path, accept: "application/json, text/javascript, */*" });
  const text = await res.text();
  let body = "";
  try {
    const j = JSON.parse(text);
    body = (Array.isArray(j) && j[0] && j[0].body) || "";
  } catch (e) {
    body = text;
  }
  if (!body) return null;
  const srcM = /<source[^>]+src=["']([^"']+)["']/i.exec(body) || /src=["']([^"']+)["']/i.exec(body);
  if (!srcM) return null;
  let url = absolute(srcM[1].replace(/\\\//g, "/"));
  url = url.replace(/\.flv(?=$|\?)/i, ".mp3");
  return { url: url, referer: BASE + path };
}

/* ---------------------------------------------------------------- 搜索（站内无搜索，扫分类页建本地索引） */

const INDEX_KEY = "searchIndex";

async function scanIndex() {
  const cached = stored(INDEX_KEY, null);
  if (cached && cached.at && Date.now() - cached.at < INDEX_TTL && (cached.items || []).length) return cached.items;
  const cats = await categories();
  const items = [];
  const seen = new Set();
  for (const c of cats) {
    try {
      const list = bookBlocks(await html("/" + c.id + "/"), 60);
      for (const t of list) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        items.push({ id: t.id, name: t.name, anchor: (t.artists[0] || {}).name || "", imageUrl: (t.album || {}).imageUrl || "" });
      }
    } catch (e) {
      /* 单个分类失败不影响索引 */
    }
  }
  if (items.length) keep(INDEX_KEY, { at: Date.now(), items: items.slice(0, 1500) });
  return items;
}

export async function search(args) {
  const query = String((args && args.query) || "").trim();
  const kind = (args && args.kind) || "tracks";
  const offset = Number((args && args.offset) || 0);
  if (kind !== "tracks" && kind !== "track") return { tracks: [], more: false };
  if (!query) return { tracks: [], more: false };
  let items = [];
  try {
    items = await scanIndex();
  } catch (e) {
    return { tracks: [], more: false };
  }
  const core = query.replace(/[《》\s]/g, "").toLowerCase();
  const hits = items
    .filter((it) => (it.name + " " + (it.anchor || "")).replace(/\s/g, "").toLowerCase().indexOf(core) >= 0)
    .slice(0, 80);
  const tracks = hits.map((it) =>
    makeTrack(it.id, it.name, {
      artists: it.anchor ? [{ name: it.anchor, id: "" }] : [],
      album: { id: it.id, name: it.name, imageUrl: it.imageUrl || "" },
    })
  );
  remember(tracks);
  return { tracks: tracks.slice(offset, offset + 20), more: tracks.length > offset + 20 };
}

export function suggest(args) {
  const query = String((args && args.query) || "").trim();
  if (!query) return [];
  const items = stored(INDEX_KEY, { items: [] }).items || [];
  const core = query.replace(/[《》\s]/g, "").toLowerCase();
  return items
    .filter((it) => String(it.name || "").replace(/\s/g, "").toLowerCase().indexOf(core) >= 0)
    .slice(0, 6)
    .map((it) => it.name);
}

/* ---------------------------------------------------------------- 视图 */

export async function home() {
  const page = await html("/");
  const cats = navCats(page);
  if (cats.length) {
    catCache = cats;
    keep("cats", cats);
  }
  const list = bookBlocks(page, 40);
  remember(list);
  const sections = [];
  if (list.length) sections.push({ title: "最新评书", tracks: list, pageTitle: CFG.name });
  const links = cats.length ? cats.map((c) => ({ title: c.name, page: "cat:" + c.id + ":1" })) : catLinks();
  if (links.length) sections.push({ title: "按评书者看", links: links });
  return { title: CFG.name, subtitle: CFG.subtitle, sections: sections };
}

export async function browse(args) {
  const raw = String((args && args.page) || "");
  const cats = await categories();
  const links = cats.map((c) => ({ title: c.name, page: "cat:" + c.id + ":1" }));
  if (!raw || raw === "categories") return { title: CFG.name + " 分类", sections: [{ title: "评书者", links: links }] };
  const m = /^cat:([a-z0-9]{4,8}):([0-9]+)$/.exec(raw);
  if (!m) throw fail("unavailable", "没有这个页面");
  const id = m[1];
  const pageNo = Number(m[2]) || 1;
  /* 分类页是单页，没有 index_2.html 这类分页 */
  const list = bookBlocks(await html("/" + id + "/"), 80);
  remember(list);
  return {
    title: catName(id),
    subtitle: CFG.name + (pageNo > 1 ? " · 第 " + pageNo + " 页" : ""),
    sections: [{ title: catName(id) + "的作品", tracks: list }].concat(links.length ? [{ title: "其他评书者", links: links.filter((l) => l.page !== "cat:" + id + ":1").slice(0, 6) }] : []),
  };
}

export async function album(args) {
  let key = String((args && args.id) || "");
  if (!key.startsWith("/")) {
    const t = trackBy(key);
    if (t) key = t.id;
  }
  if (!BOOK_RE.test(key)) throw fail("invalid", "没有这本评书");
  const info = await bookInfo(key);
  const tracks = chaptersToTracks(key, info);
  remember(tracks);
  const notes = [
    info.anchor ? "评书者：" + info.anchor : "",
    info.status ? "状态：" + info.status : "",
    info.chapters.length ? "共 " + info.chapters.length + " 集" : "",
  ].filter(Boolean).join(" · ");
  return {
    album: {
      id: key,
      name: info.title,
      imageUrl: info.cover || undefined,
      artists: info.anchor ? [{ name: info.anchor }] : undefined,
      description: [info.desc, notes].filter(Boolean).join("\n"),
    },
    tracks: tracks,
  };
}

export async function stream(args) {
  const raw = String((args && args.id) || "");
  let path = raw;
  if (!path.startsWith("/")) {
    const t = trackBy(raw);
    if (t) path = t.id;
  }
  if (!path.startsWith("/")) throw fail("invalid", "没有这一集");
  let target = path;
  if (BOOK_RE.test(path)) {
    const info = await bookInfo(path);
    if (!info.chapters.length) throw fail("unavailable", "这本评书没有可播的章节");
    target = info.chapters[0].path;
  } else if (!EP_RE.test(path)) {
    throw fail("invalid", "没有这一集");
  }
  const audio = await audioOf(target);
  if (!audio) throw fail("unavailable", "这一集取不到音频地址");
  return {
    url: audio.url,
    type: /\.mp3(?=$|\?)/i.test(audio.url) ? "mp3" : "m4a",
    headers: { referer: audio.referer, "user-agent": UA },
    title: (trackBy(raw) || {}).name || "",
  };
}

export function lyrics() {
  return { lrc: "" };
}

export function like(args) {
  const k = String((args && args.id) || "");
  const ids = new Set(stored("liked", []));
  const data = stored("likedTracks", {});
  if (args && args.on) {
    ids.add(k);
    const t = trackBy(k);
    if (t) {
      data[k] = t;
      keep("likedTracks", data);
    }
  } else ids.delete(k);
  keep("liked", [...ids]);
}

export function isLiked(args) {
  const s = new Set(stored("liked", []));
  const out = {};
  for (const id of (args && args.ids) || []) out[id] = s.has(String(id));
  return out;
}

export function liked(args) {
  const offset = Number((args && args.offset) || 0);
  const ids = stored("liked", []).slice().reverse();
  const d = stored("likedTracks", {});
  const t = ids.map((id) => d[id]).filter(Boolean).slice(offset, offset + 60);
  return { tracks: t, more: ids.length > offset + 60 };
}

export function played(args) {
  const k = String((args && args.id) || "");
  const h = stored("history", []).filter((x) => x !== k);
  h.push(k);
  keep("history", h.slice(-40));
  const t = knownTracks.get(k);
  if (t) {
    const d = stored("historyTracks", {});
    d[k] = t;
    for (const o of Object.keys(d)) if (h.slice(-40).indexOf(o) < 0) delete d[o];
    keep("historyTracks", d);
  }
}

export function recent() {
  const ids = stored("history", []).slice(-40).reverse();
  const d = stored("historyTracks", {});
  return ids.map((id) => d[id] || knownTracks.get(id)).filter(Boolean).slice(0, 20);
}
