// 显示名：石头听书（shitou）
// 站点自己不放音频：每本书是一篇文章(/p/<id>.html)，正文里嵌一个 B 站播放器 iframe，
// 音频要从 B 站 dash 取（m4s，AAC-LC），再用本机 ffmpeg 重封装成 .m4a 交给播放器。
const CFG = {
  id: "shitou",
  name: "石头听书",
  base: "https://www.shitou.club",
  subtitle: "有声书、小说合集（音频来自 B 站）",
};

const BASE = CFG.base;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const BILI_REFERER = "https://www.bilibili.com/";
const PAGE_TTL = 5 * 60 * 1000;
const MAP_TTL = 6 * 60 * 60 * 1000;
const SEP = String(host.dir || "").indexOf("\\") >= 0 ? "\\" : "/";

const pageCache = new Map();
const knownTracks = new Map();

function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function stored(k, f) { const v = host.storage.get(k); return v === undefined || v === null ? f : v; }
function keep(k, v) { host.storage.set(k, v); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function clean(s) { return String(s == null ? "" : s).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[\s\u00a0]+/g, " ").trim(); }
function absolute(u) {
  const s = String(u || "").trim().replace(/\\\//g, "/");
  if (!s) return "";
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return BASE + s;
  return s;
}
function attr(tag, name) {
  const r = new RegExp(name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
  const m = r.exec(tag);
  return m ? (m[2] !== undefined ? m[2] : m[3]) : "";
}

async function getText(path, referer) {
  const url = path.startsWith("http") ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < PAGE_TTL) return cached.text;
  let last = "";
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          referer: referer || BASE + "/",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "zh-CN,zh;q=0.9",
        },
      });
      const text = await res.text();
      if (res.status >= 500 || text.length < 200) { last = "站点返回了 " + res.status; await wait(1500 * (i + 1)); continue; }
      if (!res.ok) throw fail("unavailable", "站点返回了 " + res.status);
      pageCache.set(url, { text, at: Date.now() });
      if (pageCache.size > 40) {
        const oldest = [...pageCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) pageCache.delete(oldest[0]);
      }
      return text;
    } catch (e) {
      if (e && e.code) throw e;
      last = (e && e.message) || String(e);
      await wait(1500 * (i + 1));
    }
  }
  throw fail("unavailable", last || "连不上 " + BASE);
}

/* ---------------------------------------------------------------- bilibili */

async function biliJson(path) {
  const url = "https://api.bilibili.com" + path;
  let last = "";
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          referer: BILI_REFERER,
          cookie: "buvid3=" + await buvid(),
          accept: "application/json",
        },
      });
      const text = await res.text();
      if (res.status === 412 || res.status >= 500) { last = "B 站返回了 " + res.status; await wait(1200 * (i + 1)); continue; }
      let data;
      try { data = JSON.parse(text); } catch (e) { throw fail("unavailable", "B 站返回的不是 JSON"); }
      if (data && data.code === -404) throw fail("invalid", "B 站上没有这个视频：" + (data.message || ""));
      if (data && data.code !== 0) throw fail("unavailable", "B 站：" + (data.message || data.code));
      return data.data;
    } catch (e) {
      if (e && e.code) throw e;
      last = (e && e.message) || String(e);
      await wait(1200 * (i + 1));
    }
  }
  throw fail("unavailable", last || "B 站接口请求失败");
}

async function buvid() {
  const cached = stored("buvid3", "");
  if (cached) return cached;
  try {
    const res = await fetch("https://api.bilibili.com/x/frontend/finger/spi", {
      headers: { "user-agent": UA, referer: BILI_REFERER },
    });
    const data = await res.json();
    const v = String((data && data.data && data.data.b_3) || "");
    if (v) keep("buvid3", v);
    return v;
  } catch (e) {
    return "";
  }
}

async function videoInfo(bvid) {
  const key = "video:" + bvid;
  const cached = stored(key, null);
  if (cached && Date.now() - cached.at < MAP_TTL && cached.pages) return cached;
  const data = await biliJson("/x/web-interface/view?bvid=" + encodeURIComponent(bvid));
  const info = {
    at: Date.now(),
    bvid: bvid,
    title: clean(data.title || ""),
    pages: (data.pages || []).map((p) => ({ page: Number(p.page) || 0, cid: String(p.cid || ""), part: clean(p.part || ""), duration: Number(p.duration) || 0 })),
  };
  keep(key, info);
  return info;
}

async function audioUrl(bvid, cid) {
  const data = await biliJson("/x/player/playurl?bvid=" + encodeURIComponent(bvid) + "&cid=" + encodeURIComponent(cid) + "&fnval=16&fourk=1");
  const auds = (data && data.dash && data.dash.audio) || [];
  if (!auds.length) throw fail("unavailable", "B 站没有给这条视频的音频流");
  const sorted = auds.slice().sort((a, b) => (Number(b.bandwidth) || 0) - (Number(a.bandwidth) || 0));
  const best = sorted.find((a) => /mp4a/i.test(String(a.codecs || ""))) || sorted[0];
  const url = String(best.baseUrl || best.base_url || "");
  if (!/^https?:/i.test(url)) throw fail("unavailable", "B 站音频地址无效");
  return url;
}

/* ---------------------------------------------------------------- ffmpeg */

function fileFor(pid, page) {
  const dir = String(host.dataDir || "").replace(/[\\/]+$/, "");
  return dir + SEP + "shitou-" + pid + "-" + (page % 4) + ".m4a";
}
function toFileUrl(p) {
  return "file://" + p.split("/").map((part) => encodeURIComponent(part).replace(/%3A/gi, ":")).join("/");
}
function candidates() {
  const list = [];
  const custom = typeof host.setting === "function" ? host.setting("ffmpegPath") : "";
  if (custom) list.push(custom);
  const platform = host.platform || "";
  if (platform === "darwin") list.push("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg");
  else if (platform === "win32") list.push("ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe");
  else list.push("/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/snap/bin/ffmpeg");
  list.push("ffmpeg");
  return [...new Set(list)];
}

async function remux(url, path, copyOnly) {
  if (typeof host.spawn !== "function") throw new Error("host.spawn is not available");
  let last = "";
  for (const bin of candidates()) {
    let p;
    const audioArgs = copyOnly ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "64k"];
    try {
      p = host.spawn(bin, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-user_agent", UA,
        "-headers", "Referer: " + BILI_REFERER + "\r\n",
        "-i", url, "-vn", ...audioArgs,
        "-movflags", "+faststart", path,
      ]);
    } catch (e) { last = bin + ": " + e; continue; }
    if (!p) { last = bin + ": spawn refused"; continue; }
    let code = 0;
    try { code = await p.wait(); } catch (e) { last = bin + ": " + e; continue; }
    let said = "";
    try { said = (await p.errorOutput()) || ""; } catch (e) { said = ""; }
    if (code === undefined || code === null || code === 0) return;
    last = bin + ": " + (String(said).trim().slice(0, 160) || "exit " + code);
  }
  throw new Error(last || "ffmpeg not found");
}

/* ---------------------------------------------------------------- parcels */

function parseCards(html, limit) {
  const s = String(html || "");
  const out = [];
  const seen = new Set();
  for (const m of s.matchAll(/<a\s+href="\/p\/([0-9]+)\.html"[^>]*title="([^"]*)"/g)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = clean(m[2]);
    if (!title) continue;
    const around = s.slice(Math.max(0, m.index - 600), Math.min(s.length, m.index + 900));
    const coverRaw = (/data-original="([^"]+)"/.exec(around) || [])[1] || (/<img[^>]+src="([^"]+)"/.exec(around) || [])[1] || "";
    const cat = clean((/<a href="\/list\/cls\/[0-9]+\.html"[^>]*>([^<]*)<\/a>/.exec(around) || [])[1] || "");
    out.push({ id, name: title, cover: absolute(coverRaw), cat });
    if (out.length >= (limit || 40)) break;
  }
  return out;
}

function parseCats(html) {
  const out = new Map();
  for (const m of String(html || "").matchAll(/<a href="\/list\/cls\/([0-9]+)\.html"[^>]*>([^<]{1,20})<\/a>/g)) {
    const id = m[1];
    const name = clean(m[2]);
    if (!name || name.length < 2) continue;
    if (!out.has(id)) out.set(id, name);
  }
  return [...out.entries()].map(([id, name]) => ({ id, name }));
}

function parseAlbum(html, id) {
  const s = String(html || "");
  const titleTag = (/<title>([\s\S]*?)<\/title>/i.exec(s) || [])[1] || "";
  const title = clean(titleTag);
  const book = (title.match(/《([^》]+)》/) || [])[1] || clean(title.split(" - ")[0]);
  const author = (title.match(/作者[：:]\s*([^）)】]+)/) || [])[1] || "";
  const cat = (title.match(/【([^】]+)】/) || [])[1] || "";
  const bvid = ((/player\.bilibili\.com\/player\.html\?[^"']*bvid=([A-Za-z0-9]+)/.exec(s) || [])[1] || (/bvid=([A-Za-z0-9]+)/.exec(s) || [])[1] || "");
  const desc = clean((/<meta name="description" content="([^"]*)"/.exec(s) || [])[1] || "");
  let cover = "";
  for (const m of s.matchAll(/data-original="([^"]+)"/g)) {
    const u = absolute(m[1]);
    if (/hdslb\.com/i.test(u)) { cover = u.split("@")[0]; break; }
  }
  return { id, title: clean(book), author: clean(author), cat: clean(cat), bvid, desc, cover };
}

function trackOf(a, page, part, duration) {
  const t = {
    id: a.id + ":" + page,
    name: clean(part || ("第 " + page + " 集")),
    artists: a.author ? [{ name: a.author }] : [],
    album: { id: a.id, name: a.title, imageUrl: a.cover || "" },
    duration: Number(duration || 0),
  };
  knownTracks.set(t.id, t);
  return t;
}
function remember(list) { for (const t of list || []) if (t && t.id) knownTracks.set(String(t.id), t); }
function trackBy(id) { return knownTracks.get(String(id)) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null; }

function albumEntry(c) {
  const rec = stored("albums", {});
  if (c && c.id) {
    rec[c.id] = { name: c.name, cover: c.cover || "", cat: c.cat || "" };
    const keys = Object.keys(rec);
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete rec[k];
    keep("albums", rec);
  }
  return {
    id: c.id,
    name: c.name,
    artists: [],
    album: { id: c.id, name: c.name, imageUrl: c.cover || "" },
    duration: 0,
  };
}

/* ---------------------------------------------------------------- views */

export async function home() {
  const html = await getText("/list/cls/10042.html");
  const list = parseCards(html, 40);
  const cats = parseCats(html);
  remember(list.map((c) => ({ id: c.id, name: c.name, artists: [], album: { id: c.id, name: c.name, imageUrl: c.cover || "" }, duration: 0 })));
  const sections = [];
  if (list.length) sections.push({ title: "有声书 · 最新", tracks: list.map(albumEntry) });
  if (cats.length) sections.push({ title: "分类", links: cats.map((c) => ({ title: c.name, page: "cat:" + c.id + ":1" })) });
  return { title: CFG.name, subtitle: CFG.subtitle, sections };
}

export async function browse(args) {
  const raw = String((args && args.page) || "");
  if (!raw || raw === "categories") {
    const cats = parseCats(await getText("/list/cls/10042.html"));
    return {
      title: CFG.name + "分类",
      sections: [{ title: "分类", links: cats.map((c) => ({ title: c.name, page: "cat:" + c.id + ":1" })) }],
    };
  }
  const m = /^cat:([0-9]+):([0-9]+)$/.exec(raw);
  if (!m) throw fail("unavailable", "没有这个页面");
  const tid = m[1], pageNo = Number(m[2]) || 1;
  const html = await getText("/list/cls/" + tid + ".html" + (pageNo > 1 ? "?page=" + pageNo : ""));
  const list = parseCards(html, 40);
  const cats = parseCats(html);
  const term = clean((/<h1 class="term-title">([^<]*)<\/h1>/.exec(html) || [])[1] || "分类");
  const tracks = list.map(albumEntry);
  const links = [];
  if (list.length >= 10) links.push({ title: "下一页", page: "cat:" + tid + ":" + (pageNo + 1) });
  for (const c of cats.slice(0, 6)) links.push({ title: c.name, page: "cat:" + c.id + ":1" });
  return {
    title: term,
    subtitle: CFG.name + " · 第 " + pageNo + " 页",
    sections: [{ title: term, tracks }].concat(links.length ? [{ title: "更多", links }] : []),
  };
}

export async function album(args) {
  const raw = String((args && args.id) || "");
  const pid = raw.split(":")[0];
  if (!/^[0-9]+$/.test(pid)) throw fail("invalid", "没有这本书");
  const info = parseAlbum(await getText("/p/" + pid + ".html"), pid);
  if (!info.bvid) throw fail("unavailable", "这一页没有 B 站视频，播不了");
  const video = await videoInfo(info.bvid);
  const a = { id: pid, title: info.title || video.title, author: info.author, cover: info.cover, cat: info.cat };
  const list = video.pages.map((p) => trackOf(a, p.page, p.part, p.duration));
  remember(list);
  const notes = [
    info.author ? "作者：" + info.author : "",
    info.cat ? "分类：" + info.cat : "",
    "共 " + list.length + " 集（音频取自 B 站：" + info.bvid + "）",
  ].filter(Boolean).join(" · ");
  return {
    album: {
      id: pid,
      name: a.title,
      imageUrl: a.cover || undefined,
      artists: a.author ? [{ name: a.author }] : undefined,
      description: [info.desc, notes].filter(Boolean).join("\n"),
    },
    tracks: list,
  };
}

export async function stream(args) {
  const raw = String((args && args.id) || "");
  const parts = raw.split(":");
  let pid = parts[0];
  let pageNo = Number(parts[1] || 0);
  if (!/^[0-9]+$/.test(pid)) throw fail("invalid", "没有这一集");
  if (!pageNo) {
    const t = trackBy(raw);
    if (t && /^[0-9]+:[0-9]+$/.test(t.id)) { pid = t.id.split(":")[0]; pageNo = Number(t.id.split(":")[1]); }
  }
  if (!pageNo) pageNo = 1;
  const info = parseAlbum(await getText("/p/" + pid + ".html"), pid);
  if (!info.bvid) throw fail("unavailable", "这一页没有 B 站视频，播不了");
  const video = await videoInfo(info.bvid);
  const item = video.pages.find((p) => p.page === pageNo) || video.pages[0];
  if (!item || !item.cid) throw fail("unavailable", "B 站视频里没有第 " + pageNo + " 集");
  const src = await audioUrl(info.bvid, item.cid);
  const title = (trackBy(pid + ":" + pageNo) || {}).name || item.part || "";

  /* 没有 spawn 能力的环境（探测脚本）直接给 B 站 dash 地址，能让宿主取到内容再说 */
  if (typeof host.spawn !== "function") {
    return { url: src, type: "m4a", headers: { "user-agent": UA, referer: BILI_REFERER }, title };
  }

  const path = fileFor(pid, pageNo);
  try {
    await remux(src, path, true);
  } catch (e) {
    try { await remux(src, path, false); } catch (e2) {
      throw fail("setup", "B 站的音频是 m4s 分片，需要本机 ffmpeg 重封装成 m4a — " + ((e2 && e2.message) || "ffmpeg 调用失败"));
    }
  }
  return { url: toFileUrl(path), type: "m4a", headers: { "user-agent": UA, referer: BILI_REFERER }, title };
}

export async function search(args) {
  const query = String((args && args.query) || "").trim();
  const kind = (args && args.kind) || "tracks";
  const offset = Number((args && args.offset) || 0);
  if (kind !== "tracks" && kind !== "track") return { tracks: [], more: false };
  if (!query) return { tracks: [], more: false };
  const pageNo = 1 + Math.floor(offset / 20);
  const html = await getText("/?s=" + encodeURIComponent(query) + (pageNo > 1 ? "&paged=" + pageNo : ""));
  const list = parseCards(html, 40);
  const tracks = list.map(albumEntry);
  return { tracks, more: list.length >= 20 };
}

export function suggest(args) {
  const query = String((args && args.query) || "").trim();
  if (!query) return [];
  const rec = stored("albums", {});
  const core = query.replace(/[《》\s]/g, "").toLowerCase();
  const names = [];
  for (const k of Object.keys(rec)) {
    const n = String(rec[k] && rec[k].name || "");
    if (!n) continue;
    if (n.replace(/\s/g, "").toLowerCase().indexOf(core) < 0) continue;
    if (names.indexOf(n) >= 0) continue;
    names.push(n);
    if (names.length >= 6) break;
  }
  return names;
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
  keep("history", h.slice(-60));
  const t = knownTracks.get(k);
  if (t) {
    const d = stored("historyTracks", {});
    d[k] = t;
    for (const o of Object.keys(d)) if (h.slice(-60).indexOf(o) < 0) delete d[o];
    keep("historyTracks", d);
  }
}

export function recent() {
  const ids = stored("history", []).slice(-40).reverse();
  const d = stored("historyTracks", {});
  return ids.map((id) => d[id] || knownTracks.get(id)).filter(Boolean).slice(0, 20);
}
