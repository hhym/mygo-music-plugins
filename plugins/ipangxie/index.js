// 显示名：我爱听书（ipangxie）
const CFG = {
  id: "ipangxie",
  name: "我爱听书",
  base: "https://ipangxie.com",
  details: ["book"],
  subtitle: "有声小说、评书",
};

const BASE = CFG.base;
const REFERER = BASE + "/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PAGE_TTL = 5 * 60 * 1000;
const INDEX_TTL = 30 * 60 * 1000;

const detailRe = new RegExp("^(?:/" + CFG.details.join("/|/") + ")/[0-9]+\\.html$");
const playRe = /^\/play\/[0-9]+-[0-9]+-[0-9]+\.html$/;
const catRe = /^(\/[a-z0-9]+)\/([0-9]+)(?:-([0-9]+))?\.html$/;

const pageCache = new Map();
const knownTracks = new Map();

function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function stored(k, f) { const v = host.storage.get(k); return v === undefined || v === null ? f : v; }
function keep(k, v) { host.storage.set(k, v); }
function unescapeHtml(s) {
  return String(s).replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, n) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n])
    .replace(/&[a-zA-Z]+;/g, " ");
}
function clean(s) { return unescapeHtml(String(s || "").replace(/<[^>]+>/g, " ")).replace(/[\s\u00a0]+/g, " ").trim(); }
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
  for (const m of [...String(html).matchAll(/<img\b([^>]*?)>/gi)]) {
    const src = attr(m[0], "data-original") || attr(m[0], "data-src") || attr(m[0], "src");
    if (src && !/none|blank|loading|lazy\.gif|placeholder|load\.png/i.test(src)) {
      const a = absolute(src);
      if (/\.(jpg|jpeg|png|webp)/i.test(a) || /xmcdn|img/i.test(a)) return a;
    }
  }
  return "";
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
function remember(list) { for (const t of list || []) if (t && t.id) knownTracks.set(String(t.id), t); }
function trackBy(id) { return knownTracks.get(String(id)) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null; }

async function request(path, options) {
  const o = options || {};
  const url = path.startsWith("http") ? path : BASE + path;
  let res;
  try {
    res = await fetch(url, {
      method: o.method || "GET",
      headers: {
        "user-agent": UA,
        referer: o.referer || REFERER,
        "accept-language": "zh-CN,zh;q=0.9",
        accept: "text/html,*/*",
      },
      body: o.body,
    });
  } catch (e) {
    throw fail("unavailable", "连不上 " + BASE + "：" + (e && e.message ? e.message : e));
  }
  if (!res.ok) throw fail("unavailable", BASE + " 返回了 " + res.status);
  return res;
}

async function html(path, options) {
  const o = options || {};
  const key = (path.startsWith("http") ? path : BASE + path) + "|" + (o.referer || "");
  const cached = pageCache.get(key);
  if (cached && Date.now() - cached.at < PAGE_TTL) return cached.text;
  const res = await request(path, o);
  const text = await res.text();
  if (/系统安全验证|请输入正确的验证码/.test(text)) throw fail("blocked", "站点要求验证码，这一页取不到");
  pageCache.set(key, { text, at: Date.now() });
  if (pageCache.size > 100) {
    const oldest = [...pageCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) pageCache.delete(oldest[0]);
  }
  return text;
}

function cardList(page, limit) {
  const s = String(page || "");
  const out = [];
  const seen = new Set();
  for (const m of s.matchAll(/<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi)) {
    const tag = m[1] || "";
    const href = attr(tag, "href");
    if (!href) continue;
    const path = href.startsWith("http") ? (href.indexOf(BASE) === 0 ? href.slice(BASE.length) : "") : href;
    if (!path || !detailRe.test(path) || seen.has(path)) continue;
    const name = clean(attr(tag, "title") || (m[2].match(/class="name"[^>]*>([^<]+)</) || [])[1] || m[2]);
    if (!name || name.length < 2 || name.length > 70) continue;
    if (/^(首页|分类|搜索|全部|更多|下一页|上一页|播放|收听|下载|排行)$/.test(name)) continue;
    seen.add(path);
    const around = s.slice(Math.max(0, (m.index || 0) - 400), Math.min(s.length, (m.index || 0) + 400));
    const cover = imageFrom(around);
    const track = makeTrack(path, name, { album: { id: path, name: CFG.name, imageUrl: cover } });
    knownTracks.set(String(track.id), track);
    out.push(track);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function catList(page) {
  const s = String(page || "");
  const out = [];
  const seen = new Set();
  for (const m of s.matchAll(/<a\b([^>]*)>([^<]{1,12})<\/a>/gi)) {
    const href = attr(m[1] || "", "href");
    if (!href || href.indexOf("http") === 0) continue;
    const mm = catRe.exec(href);
    if (!mm || mm[3]) continue;
    const prefix = mm[1];
    if (CFG.details.indexOf(prefix.slice(1)) >= 0) continue;
    const name = clean(m[2]);
    if (!name || name.length < 2 || name.length > 8) continue;
    if (/^(首页|搜索|排行|全部|更多|下一页|上一页|登录|注册|最新|热门)$/.test(name)) continue;
    const key = prefix + "/" + mm[2];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: key, name: name, prefix: prefix, tid: mm[2] });
  }
  return out.slice(0, 16);
}

let catCache = null;
async function categories() {
  if (catCache) return catCache;
  const cats = catList(await html(CFG.homePath || "/"));
  if (cats.length) catCache = cats;
  return cats;
}

function catLinks() {
  return [];
}

async function bookInfo(path) {
  const page = await html(path);
  const title = clean(
    (page.match(/<title>《(.+?)》/) || [])[1] ||
    (page.match(/<em>([^<]{2,60})<\/em>/) || [])[1] ||
    ""
  );
  const cover = imageFrom(page) || (page.match(/https?:\/\/imagev2\.xmcdn\.com[^\s"'<>]+\.(?:jpg|png|webp)/i) || [])[0] || "";
  const anchor = clean((page.match(/播讲：<\/span>(?:<a[^>]*>)?([^<]{1,20})/) || [])[1] || (page.match(/主播[:：]<\/?[^>]*>([^<]{1,20})/) || [])[1] || "");
  const author = clean((page.match(/作者：<\/span>(?:<a[^>]*>)?([^<]{1,20})/) || [])[1] || "");
  const type = clean((page.match(/类型：<\/span>([^<]{1,12})/) || [])[1] || "");
  const desc = clean((page.match(/<meta\s+name="description"\s+content="([^"]+)"/i) || [])[1] || "");
  const chapters = [];
  const seen = new Set();
  for (const m of page.matchAll(/<a\b([^>]*)>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = attr(m[1] || "", "href");
    if (!href) continue;
    const p = href.startsWith("http") ? (href.indexOf(BASE) === 0 ? href.slice(BASE.length) : "") : href;
    if (!playRe.test(p) || seen.has(p)) continue;
    seen.add(p);
    const name = clean(m[2]);
    if (!name) continue;
    chapters.push({ path: p, name: name });
  }
  return { title: title || "未命名", cover: absolute(cover), anchor: anchor, author: author, type: type, desc: desc, chapters: chapters };
}

function chaptersToTracks(path, info) {
  const albumId = path;
  return info.chapters.map((c, i) =>
    makeTrack(c.path, c.name || "第 " + (i + 1) + " 集", {
      album: { id: albumId, name: info.title, imageUrl: info.cover },
      artists: info.anchor ? [{ name: info.anchor, id: "" }] : [],
    })
  );
}

async function audioOf(path) {
  const page = await html(path);
  const now = (page.match(/var\s+now\s*=\s*["']([^"']+)["']/) || [])[1];
  if (now) return { url: absolute(now), referer: BASE + path };
  const audios = [...page.matchAll(/https?:\/\/[^\s"'<>\\]+\.(?:m4a|mp3)(?:\?[^\s"'<>\\]*)?/gi)].map((m) => m[0]);
  const uniq = [];
  for (const a of audios) if (uniq.indexOf(a) < 0) uniq.push(a);
  if (uniq.length) return { url: uniq[0], referer: BASE + path };
  return null;
}

/* ---------------------------------------------------------------- search index */

const INDEX_KEY = "searchIndex";

async function scanIndex() {
  const cached = stored(INDEX_KEY, null);
  if (cached && cached.at && Date.now() - cached.at < INDEX_TTL && (cached.items || []).length) return cached.items;
  const cats = await categories();
  const items = [];
  const seen = new Set();
  for (const c of cats.slice(0, 8)) {
    for (let page = 1; page <= 2; page++) {
      try {
        const path = page === 1 ? c.prefix + "/" + c.tid + ".html" : c.prefix + "/" + c.tid + "-" + page + ".html";
        const list = cardList(await html(path), 30);
        for (const t of list) if (!seen.has(t.id)) { seen.add(t.id); items.push({ id: t.id, name: t.name, imageUrl: t.album && t.album.imageUrl }); }
      } catch (e) { /* 单页失败不影响索引 */ }
    }
  }
  if (items.length) keep(INDEX_KEY, { at: Date.now(), items: items.slice(0, 1200) });
  return items;
}

export async function search(args) {
  const query = String((args && args.query) || "").trim();
  const kind = (args && args.kind) || "tracks";
  const offset = Number((args && args.offset) || 0);
  if (kind !== "tracks" && kind !== "track") return { tracks: [], more: false };
  if (!query) return { tracks: [], more: false };
  if (/\d{2,}/.test(query) && query.length < 4) {
    return { tracks: [], more: false };
  }
  const items = await scanIndex();
  const core = query.replace(/[《》\s]/g, "").toLowerCase();
  const hits = items
    .filter((it) => it.name.replace(/\s/g, "").toLowerCase().indexOf(core) >= 0)
    .slice(0, 60);
  const tracks = hits.map((it) => makeTrack(it.id, it.name, { album: { id: it.id, name: CFG.name, imageUrl: it.imageUrl || "" } }));
  remember(tracks);
  return { tracks: tracks.slice(offset, offset + 20), more: tracks.length > offset + 20 };
}

export function suggest(args) {
  const query = String((args && args.query) || "").trim();
  if (!query) return [];
  const items = (stored(INDEX_KEY, { items: [] }).items || []);
  const core = query.replace(/[《》\s]/g, "").toLowerCase();
  return items.filter((it) => it.name.replace(/\s/g, "").toLowerCase().indexOf(core) >= 0).slice(0, 6).map((it) => it.name);
}

/* ---------------------------------------------------------------- views */

export async function home() {
  const page = await html(CFG.homePath || "/");
  const list = cardList(page, 40);
  const cats = catList(page);
  if (cats.length) catCache = cats;
  remember(list);
  const sections = [];
  if (list.length) sections.push({ title: "最新更新", tracks: list, pageTitle: CFG.name });
  if (cats.length) sections.push({ title: "分类", links: cats.map((c) => ({ title: c.name, page: "cat:" + c.prefix + ":" + c.tid + ":1" })) });
  return { title: CFG.name, subtitle: CFG.subtitle, sections: sections };
}

export async function browse(args) {
  const raw = String((args && args.page) || "");
  const cats = await categories();
  const links = cats.map((c) => ({ title: c.name, page: "cat:" + c.prefix + ":" + c.tid + ":1" }));
  if (!raw || raw === "categories") return { title: CFG.name + "分类", sections: [{ title: "分类", links: links }] };
  const m = /^cat:(\/[a-z0-9]+):([0-9]+):([0-9]+)$/.exec(raw);
  if (!m) throw fail("unavailable", "没有这个页面");
  const prefix = m[1], tid = m[2], pageNo = Number(m[3]) || 1;
  const name = (cats.find((c) => c.prefix === prefix && c.tid === tid) || {}).name || "分类";
  const path = pageNo === 1 ? prefix + "/" + tid + ".html" : prefix + "/" + tid + "-" + pageNo + ".html";
  const list = cardList(await html(path), 40);
  const next = pageNo < 40 && list.length >= 10 ? [{ title: "下一页", page: "cat:" + prefix + ":" + tid + ":" + (pageNo + 1) }] : [];
  return {
    title: name,
    subtitle: CFG.name + " · 第 " + pageNo + " 页",
    sections: [{ title: name, tracks: list }].concat(next.length ? [{ title: "更多", links: next.concat(links.slice(0, 6)) }] : [{ title: "分类", links: links }]),
  };
}

export async function album(args) {
  let key = String((args && args.id) || "");
  if (!key.startsWith("/")) {
    const t = trackBy(key);
    if (t) key = t.id;
  }
  if (!key.startsWith("/")) throw fail("invalid", "没有这本专辑");
  const info = await bookInfo(key);
  const tracks = chaptersToTracks(key, info);
  remember(tracks);
  const notes = [
    info.anchor ? "播讲：" + info.anchor : "",
    info.author ? "作者：" + info.author : "",
    info.type ? "类型：" + info.type : "",
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
  if (!playRe.test(path)) {
    const info = await bookInfo(path);
    if (!info.chapters.length) throw fail("unavailable", "这本书没有可播的章节");
    target = info.chapters[0].path;
  }
  const audio = await audioOf(target);
  if (!audio) throw fail("unavailable", "播放页里没有找到音频地址");
  return {
    url: audio.url,
    type: /\.mp3(?:$|\?)/i.test(audio.url) ? "mp3" : "m4a",
    headers: { referer: audio.referer, "user-agent": UA },
    title: (trackBy(raw) || {}).name || "",
  };
}

export function lyrics() { return { lrc: "" }; }

export function like(args) {
  const k = String((args && args.id) || "");
  const ids = new Set(stored("liked", []));
  const data = stored("likedTracks", {});
  if (args && args.on) {
    ids.add(k);
    const t = trackBy(k);
    if (t) { data[k] = t; keep("likedTracks", data); }
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
