const BASE = "https://ting05.com";
const NAME = "无忧音乐网";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const COVER = BASE + "/wuyou/images/cover-logo.jpg";
const TTL = 3 * 60 * 1000;
const cache = new Map();
const known = new Map();

const CATS = [
  { name: "最近更新", path: "/category-1.html" },
  { name: "华语音乐", path: "/category-4.html" },
  { name: "日韩音乐", path: "/category-5.html" },
  { name: "欧美音乐", path: "/category-6.html" },
  { name: "DJ舞曲", path: "/category-7.html" },
  { name: "精选合集", path: "/category-2.html" },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function clean(s) {
  return String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function abs(u) {
  if (!u) return "";
  u = String(u).trim();
  if (/^https?:/i.test(u)) return u;
  if (u.startsWith("//")) return "https:" + u;
  return BASE + (u.startsWith("/") ? u : "/" + u);
}
function songPath(href) {
  const m = String(href || "").match(/(?:https?:\/\/ting05\.com)?\/(song\/\d+\.html)/i);
  return m ? "/" + m[1] : "";
}
function songId(path) { const m = String(path || "").match(/\/song\/(\d+)\.html/); return m ? m[1] : ""; }
function songName(raw) {
  return clean(raw).replace(/mp3歌曲免费下载.*$/i, "").replace(/\s*\[(?:MP3|FLAC|WAV)[^\]]*\]\s*下载.*$/i, "").replace(/🔥+/g, "").trim();
}
function artistOf(name) {
  const i = name.indexOf("-");
  if (i < 1) return [];
  return [{ id: "", name: clean(name.slice(0, i)) }];
}
function makeAlbum(path, name, image) {
  return { id: path, name, imageUrl: image || COVER, artists: artistOf(name) };
}
function makeTrack(path, name, extra) {
  return { id: path, name, artists: artistOf(name), album: { id: path, name, imageUrl: (extra && extra.imageUrl) || COVER }, duration: (extra && extra.duration) || 0 };
}
function rememberAlbum(a) { if (a && a.id) known.set(a.id, a); }

async function fetchText(path, opts) {
  const rel = /^https?:/i.test(path) ? path.replace(/^https?:\/\/[^/]+/i, "") : path;
  const key = rel + "|" + ((opts && opts.method) || "GET");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let last = null;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(BASE + rel, {
        method: (opts && opts.method) || "GET",
        headers: { "user-agent": UA, referer: REFERER, ...((opts && opts.headers) || {}) },
      });
      if (!res.ok) throw fail("upstream", `HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 80) throw fail("upstream", "empty body");
      if (/系统安全验证|Just a moment/i.test(text)) throw fail("unavailable", "源站要求安全验证");
      cache.set(key, { t: Date.now(), v: text });
      return text;
    } catch (e) { last = e; await wait(400 + i * 600); }
  }
  throw last || fail("unavailable", `${NAME}暂时无法访问`);
}

function parseSongs(html, fromSearch) {
  let s = String(html || "");
  if (fromSearch) {
    const at = s.search(/fa-angle-right"><\/i>\s*搜索|fa-angle-right'><\/i>\s*搜索/i);
    if (at >= 0) s = s.slice(at);
  }
  const out = []; const seen = new Set();
  const re = /<a\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(s))) {
    const attrs = m[1];
    const href = (attrs.match(/href=(?:"([^"]*)"|'([^']*)')/i) || []);
    const path = songPath(href[1] || href[2] || "");
    if (!path || seen.has(path)) continue;
    const title = clean((attrs.match(/title=(?:"([^"]*)"|'([^']*)')/i) || [])[1] || (attrs.match(/title=(?:"([^"]*)"|'([^']*)')/i) || [])[2] || "");
    const name = songName(title || m[2]);
    if (!name || name.length < 2) continue;
    if (/^(首页|最近更新|华语音乐|欧美音乐|日韩音乐|DJ舞曲|精选合集打包下载)$/.test(name)) continue;
    seen.add(path);
    out.push(makeAlbum(path, name, COVER));
  }
  return out;
}

export async function home() {
  const html = await fetchText("/");
  const songs = parseSongs(html).slice(0, 30);
  if (!songs.length) throw fail("unavailable", "首页没有解析到歌曲，源站可能改版");
  for (const a of songs) rememberAlbum(a);
  const tracks = songs.map((a) => makeTrack(a.id, a.name));
  return {
    title: NAME,
    subtitle: "免费 MP3 音乐下载",
    sections: [
      { title: "最新推荐", tracks },
      { title: "分类", links: CATS.map((c) => ({ title: c.name, page: `cat:${c.path}:1` })) },
    ],
  };
}

function parsePage(page) { const m = String(page || "").match(/^cat:(\/category-[0-9]+\.html):(\d+)$/); return m ? { path: m[1], page: Number(m[2]) || 1 } : null; }
function pagePath(path, n) {
  if (n <= 1) return path;
  return path.replace(/\.html$/, `_${n}.html`);
}
export async function browse({ page } = {}) {
  if (!page || page === "categories") {
    return { title: "分类", sections: [{ title: "全部分类", links: CATS.map((c) => ({ title: c.name, page: `cat:${c.path}:1` })) }] };
  }
  const p = parsePage(page);
  if (!p) throw fail("unavailable", "没有这个页面");
  const html = await fetchText(pagePath(p.path, p.page));
  const songs = parseSongs(html);
  for (const a of songs) rememberAlbum(a);
  const title = (CATS.find((c) => c.path === p.path) || {}).name || "歌曲列表";
  return { title, subtitle: `第 ${p.page} 页`, sections: [{ title: `${title} · 第 ${p.page} 页`, albums: songs }] };
}

export async function search({ query, kind = "albums", offset = 0 } = {}) {
  const term = String(query || "").trim();
  if (!term) return { tracks: [], albums: [], more: false };
  if (kind && kind !== "albums" && kind !== "album") return { tracks: [], albums: [], more: false };
  const html = await fetchText(`/search.php?q=${encodeURIComponent(term)}`);
  const songs = parseSongs(html, true);
  for (const a of songs) rememberAlbum(a);
  return { albums: songs.slice(0, 30), more: songs.length > 30 };
}

export async function suggest({ query } = {}) { const r = await search({ query }); return r.albums || []; }

export async function album({ id } = {}) {
  const path = /^\/song\/\d+\.html$/.test(String(id || "")) ? String(id) : "";
  if (!path) throw fail("unavailable", "没有这个歌曲");
  const html = await fetchText(path);
  const title = songName((html.match(/<h1[^>]+class="title"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const name = title || songName((known.get(path) || {}).name) || "未命名歌曲";
  const desc = clean((html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1] || "");
  const a = makeAlbum(path, name, COVER);
  rememberAlbum(a);
  return {
    album: { ...a, description: desc },
    tracks: [makeTrack(path, name)],
  };
}

function audioType(u) { if (/\.mp3(?:$|\?)/i.test(u)) return "mp3"; if (/\.m4a(?:$|\?)/i.test(u)) return "m4a"; if (/\.aac(?:$|\?)/i.test(u)) return "aac"; return "m4a"; }
function extractAudio(html) {
  let m;
  for (const re of [
    /url\s*:\s*'([^']+)'/i,
    /url\s*:\s*"([^"]+)"/i,
    /<audio[^>]+src=['"]([^'"]+)['"]/i,
    /<source[^>]+src=['"]([^'"]+)['"]/i,
    /https?:\/\/[^"'\s<>]+\.(?:m4a|mp3|aac)(?:[?#][^"'\s<>]*)?/i,
  ]) { m = html.match(re); if (m && /^https?:|^\//.test(m[1])) return m[1]; }
  return "";
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
function fileFor(slot) { return `${String(host.dataDir).replace(/[\\/]+$/, "")}${isWindows() ? "\\" : "/"}${NAME}-${slot}.m4a`; }
function fileURL(path) { let p = String(path).replace(/\\/g, "/"); if (!p.startsWith("/")) p = "/" + p; return "file://" + p.split("/").map((x) => encodeURIComponent(x).replace(/%3A/gi, ":")).join("/"); }
function localOn() { const v = host.setting("localCache"); return v == null || v === "" ? true : String(v) !== "0"; }

async function toLocal(url, target, referer) {
  let last = "";
  for (const bin of [...(host.setting("ffmpegPath") ? [host.setting("ffmpegPath")] : []), "ffmpeg", ...(FFMPEG[host.platform] || [])]) {
    try {
      const p = host.spawn(bin, ["-y", "-hide_banner", "-loglevel", "error", "-headers", `Referer: ${referer}\r\n`, "-user_agent", UA, "-i", url, "-vn", "-c:a", "copy", "-movflags", "+faststart", target]);
      const code = await p.wait(); const err = await p.errorOutput();
      if ((code == null || code === 0) && !err) return;
      last = `${bin}: ${String(err).slice(0, 160) || code}`;
    } catch (e) { last = `${bin}: ${e && e.message ? e.message : e}`; }
  }
  throw new Error(last || "ffmpeg not found");
}

export async function stream({ id } = {}) {
  const path = /^\/song\/\d+\.html$/.test(String(id || "")) ? String(id) : (await album({ id })).tracks[0].id;
  const page = await fetchText(path);
  let u = extractAudio(page);
  if (!u) throw fail("unavailable", "歌曲页没有返回音频地址");
  const type = audioType(u);
  const headers = { referer: BASE + path, "user-agent": UA };
  if (!localOn()) return { url: u, type, headers, title: "" };
  const all = slots(); let slot = all.indexOf(path);
  if (slot < 0) { slot = all.findIndex((x) => !x); if (slot < 0) slot = slotOf(path); }
  try {
    const target = fileFor(slot);
    await toLocal(u, target, BASE + path);
    all[slot] = path; saveSlots(all);
    return { url: fileURL(target), type: "m4a", title: "" };
  } catch (e) {
    if (type === "m4a" || type === "mp3" || type === "aac") return { url: u, type, headers, title: "" };
    throw fail("setup", `本段需要 ffmpeg 转码：${e && e.message ? e.message : e}`);
  }
}

export function lyrics() { return {}; }
function stored(k, d) { try { const v = host.storage.get(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function like({ id, on } = {}) { const s = new Set(stored("liked", [])); if (on) s.add(String(id)); else s.delete(String(id)); host.storage.set("liked", JSON.stringify([...s])); return { id: String(id), liked: !!on }; }
export function isLiked({ ids } = {}) { const s = new Set(stored("liked", [])); const o = {}; for (const id of ids || []) o[id] = s.has(String(id)); return o; }
export function liked({ offset = 0 } = {}) { const all = stored("liked", []).map((id) => known.get(id)).filter(Boolean).map((a) => makeTrack(a.id, a.name)); return { tracks: all.slice(offset, offset + 60), more: all.length > offset + 60 }; }
export function played({ id } = {}) { if (!id) return {}; const list = stored("history", []).filter((x) => x !== id); list.push(String(id)); host.storage.set("history", JSON.stringify(list.slice(-100))); return {}; }
export function recent() { return stored("history", []).slice().reverse().map((id) => known.get(id)).filter(Boolean).map((a) => makeTrack(a.id, a.name)).slice(0, 20); }
