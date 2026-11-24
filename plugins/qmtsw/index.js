const BASE = "https://www.qmtsw.com";
const NAME = "我听评书网";
const DETAIL = "show";
const LIST = "book";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const cache = new Map();
const TTL = 3 * 60 * 1000;
const known = new Map();
const waiting = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function clean(s) {
  return String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}
function abs(u) { if (!u) return ""; if (/^https?:/i.test(u)) return u; if (u.startsWith("//")) return "https:" + u; return BASE + (u.startsWith("/") ? u : "/" + u); }
function idOf(v) { const m = String(v || "").match(/(?:mp3|show|book|info|ting|yun)\/?(\d+)|album:(\d+)|\b(\d+)\b/); return m ? (m[1] || m[2] || m[3]) : ""; }
function card(id, name, image) { return { id: `album:${id}`, name: clean(name) || "未命名专辑", imageUrl: abs(image), artists: [] }; }
function remember(list) { for (const t of list || []) { const a = t.album || t; if (a && a.id) known.set(a.id, a); } }

async function fetchText(path, opts) {
  const rel = /^https?:/i.test(path) ? path.replace(/^https?:\/\/[^/]+/i, "") : path;
  const ck = rel + "|" + ((opts && opts.method) || "GET");
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let last = null;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(BASE + rel, {
        method: (opts && opts.method) || "GET",
        headers: { "user-agent": UA, referer: REFERER, ...(opts && opts.headers || {}) },
        body: opts && opts.body,
      });
      if (!res.ok) throw fail("upstream", `HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 120) throw fail("upstream", "empty body");
      if (text.includes("系统安全验证")) throw fail("unavailable", "站点要求安全验证");
      cache.set(ck, { t: Date.now(), v: text });
      return text;
    } catch (e) { last = e; await waiting(240 + i * 420); }
  }
  throw last || fail("unavailable", `${NAME}暂时无法访问`);
}

function parseCards(html) {
  const out = []; const seen = new Set();
  const re = /<a\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const href = (attrs.match(/href="([^"]+)"/i) || [])[1] || "";
    const idm = href.match(/(?:mp3|show|info|ting)\/([0-9]+)\./i);
    if (!idm) continue;
    const id = idm[1];
    if (seen.has(id)) continue;
    const tail = html.slice(m.index, m.index + 700);
    const title = (attrs.match(/title="([^"]+)"/i) || [])[1] || "";
    const alt = (tail.match(/<img[^>]+alt="([^"]*)"/i) || [])[1] || "";
    const inner = clean((tail.slice(tail.indexOf(">") + 1).split("</a>")[0] || ""));
    const name = clean(title || alt || inner);
    if (!name) continue;
    const img = (tail.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || "";
    seen.add(id); out.push(card(id, name, img));
  }
  return out;
}
let catCache = null;
function parseCats(html) {
  const out = []; const seen = new Set();
  const re = /<a[^>]+href="(?:https?:\/\/[^/]+)?\/(?:html|list|book|category|type)\/([0-9]+)\.html"[^>]*>([^<]{1,18})<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1]; if (seen.has(id)) continue;
    const name = clean(m[2]);
    if (!name) continue;
    seen.add(id); out.push({ id, name });
  }
  return out;
}
async function categories() {
  if (catCache) return catCache;
  const html = await fetchText("/");
  catCache = parseCats(html).slice(0, 40);
  return catCache;
}

export async function home() {
  const html = await fetchText("/");
  let list = parseCards(html).slice(0, 30);
  const cats = parseCats(html).slice(0, 40);
  if (!list.length && cats.length) {
    const parts = await Promise.all(cats.slice(0, 4).map((c) => fetchText(`/${LIST}/${c.id}.html`).then(parseCards).catch(() => [])));
    const seen = new Set();
    list = [];
    for (const p of parts) for (const a of p) { if (seen.has(a.id)) continue; seen.add(a.id); list.push(a); }
  }
  if (!list.length) throw fail("unavailable", "首页没有解析到内容，源站可能改版或暂时不可用");
  remember(list);
  const sections = [{ title: "最新推荐", albums: list, pageTitle: NAME }];
  if (cats.length) sections.push({ title: "分类", links: cats.map((c) => ({ title: c.name, page: `cat:${c.id}:1` })) });
  return { title: NAME, subtitle: "有声小说 · 评书", sections };
}

export async function browse({ page } = {}) {
  const raw = String(page || "categories");
  if (raw === "categories") {
    const cats = await categories();
    return { title: "分类", sections: [{ title: "全部分类", links: cats.map((c) => ({ title: c.name, page: `cat:${c.id}:1` })) }] };
  }
  if (raw === "home:2") return { title: "最新推荐", sections: [{ title: "最新推荐", albums: parseCards(await fetchText("/")) }] };
  const m = raw.match(/^cat:([0-9]+):(\d+)$/);
  if (!m) throw fail("unavailable", "没有这个页面");
  const id = m[1]; const pageNo = Math.max(1, Number(m[2]) || 1);
  const cats = await categories();
  const info = cats.find((c) => c.id === id);
  if (!info) throw fail("unavailable", "没有这个分类");
  const path = pageNo === 1 ? `/${LIST}/${id}.html` : `/${LIST}/${id}-${pageNo}.html`;
  const html = await fetchText(path);
  const list = parseCards(html);
  remember(list);
  let max = pageNo;
  const re = new RegExp(`/${LIST}/${id}-(\\d+)\\.html`, "g");
  for (const mm of html.matchAll(re)) max = Math.max(max, Number(mm[1]) || 1);
  return {
    title: info.name,
    subtitle: `第 ${pageNo} 页`,
    sections: [
      { title: `${info.name} · 第 ${pageNo} 页`, albums: list, morePage: pageNo < max ? `cat:${id}:${pageNo + 1}` : "" },
      { title: "分类", links: cats.map((c) => ({ title: c.name, page: `cat:${c.id}:1` })) },
    ],
  };
}

export async function search({ query, kind = "albums", offset = 0 } = {}) {
  const term = String(query || "").trim();
  if (!term) return { tracks: [], albums: [], more: false };
  if (kind && kind !== "albums" && kind !== "album") return { tracks: [], albums: [], more: false };
  const hits = [...known.values()].filter((a) => a.name.toLowerCase().includes(term.toLowerCase()));
  if (hits.length) return { albums: hits.slice(0, 30), more: false };
  let cats = [];
  try { cats = await categories(); } catch (e) {}
  const lists = await Promise.all(cats.map((c) => fetchText(`/${LIST}/${c.id}.html`).then(parseCards).catch(() => [])));
  const all = []; const seen = new Set();
  for (const l of lists) for (const a of l) {
    if (seen.has(a.id)) continue;
    if (!a.name.toLowerCase().includes(term.toLowerCase())) continue;
    seen.add(a.id); all.push(a); known.set(a.id, a);
  }
  return { albums: all.slice(0, 60), more: false };
}

export async function suggest({ query } = {}) {
  const term = String(query || "").trim();
  if (!term) return [];
  return [...known.values()].filter((a) => a.name.toLowerCase().includes(term.toLowerCase())).slice(0, 8).map((a) => a.name);
}

async function albumHtml(bid) {
  const paths = [`/${DETAIL}/${bid}.html`, `/book/${bid}.html`, `/info/${bid}.html`, `/ting/${bid}.html`].filter((p, i, a) => a.indexOf(p) === i);
  for (const p of paths) {
    try {
      const html = await fetchText(p);
      if (html.includes(`/play/${bid}-`)) return { html, path: p };
    } catch (e) {}
  }
  throw fail("unavailable", "这个专辑暂时取不到内容");
}

export async function album({ id } = {}) {
  const bid = idOf(id);
  if (!bid) throw fail("unavailable", "没有这个专辑");
  const got = await albumHtml(bid);
  const html = got.html;
  let name = clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  if (!name) name = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).split(/[-_|]/)[0];
  const cover = abs((html.match(/<div class="(?:img-100|pic)[^>]*>[\s\S]{0,300}?<img[^>]+src="([^"]+)"/i) || html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1] || "");
  const author = clean((html.match(/作者[：:]\s*<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "");
  const speaker = clean((html.match(/由\s*<a[^>]*>([\s\S]*?)<\/a>[\s\S]{0,20}?播音/i) || [])[1] || "");
  const desc = clean((html.match(/(?:内容介绍|简介)[：:]\s*([\s\S]*?)<\/p>/i) || [])[1] || "");
  const tracks = []; const seen = new Set();
  const re = new RegExp(`<a[^>]+href="(\\/play\\/${bid}-[0-9]+-[0-9]+\\.html)"[^>]*>([\\s\\S]*?)<\\/a>`, "gi");
  let m;
  while ((m = re.exec(html))) {
    const link = m[1]; if (seen.has(link)) continue; seen.add(link);
    const tag = m[0].slice(0, m[0].indexOf(">") + 1);
    const title = (tag.match(/title="([^"]*)"/) || [])[1] || "";
    tracks.push({ id: link, name: clean(title) || clean(m[2]) || `第 ${tracks.length + 1} 集`, artists: speaker ? [{ id: "", name: speaker }] : [], album: { id: `album:${bid}`, name: name || "未命名专辑", imageUrl: cover }, duration: 0 });
  }
  known.set(`album:${bid}`, { id: `album:${bid}`, name, imageUrl: cover, artists: speaker ? [{ id: "", name: speaker }] : [] });
  return { album: { id: `album:${bid}`, name: name || "未命名专辑", imageUrl: cover, artists: speaker ? [{ id: "", name: speaker }] : [], description: [author && `作者：${author}`, desc].filter(Boolean).join(" · ") }, tracks };
}

function decodeNow(enc) { return String(enc || "").split("*").filter(Boolean).map((n) => String.fromCharCode(Number(n))).join(""); }
function audioType(u) { return /\.mp3(?:$|\?)/i.test(u) ? "mp3" : "m4a"; }
const isWindows = () => /win/i.test(host.platform || "");
function fileFor(slot) { return `${String(host.dataDir).replace(/[\\/]+$/, "")}${isWindows() ? "\\" : "/"}qmtsw-${slot}.m4a`; }
function fileURL(path) {
  let p = String(path).replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(p)) p = "/" + p;
  if (!p.startsWith("/")) p = "/" + p;
  return "file://" + p.split("/").map((x) => encodeURIComponent(x).replace(/%3A/gi, ":")).join("/");
}
const FFMPEG_DIRS = {
  darwin: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"],
  linux: ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/snap/bin/ffmpeg"],
  win32: ["ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"],
};
function candidates() {
  const set = host.setting("ffmpegPath"); const list = [];
  if (set) list.push(String(set));
  list.push(isWindows() ? "ffmpeg.exe" : "ffmpeg", "ffmpeg");
  for (const p of FFMPEG_DIRS[isWindows() ? "win32" : host.platform] || []) list.push(p);
  return [...new Set(list)];
}
function transcodeOn() { const v = host.setting("transcode"); return v === undefined || v === null || v === "" ? true : String(v) !== "0"; }
async function transcode(url, path, referer) {
  if (typeof host.spawn !== "function") throw new Error("host.spawn is not available");
  let last = "";
  for (const bin of candidates()) {
    let p;
    try { p = host.spawn(bin, ["-y", "-hide_banner", "-loglevel", "error", "-headers", `Referer: ${referer}\r\n`, "-user_agent", UA, "-i", url, "-vn", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", path]); }
    catch (e) { last = `${bin}: ${e}`; continue; }
    if (!p) { last = `${bin}: spawn refused`; continue; }
    let code = 0;
    try { code = await p.wait(); } catch (e) { last = `${bin}: ${e}`; continue; }
    let said = "";
    try { said = (await p.errorOutput()) || ""; } catch {}
    if ((code === undefined || code === null || code === 0) && !said) return;
    last = `${bin}: ${String(said).trim().slice(0, 160) || `exit ${code}`}`;
  }
  throw new Error(last || "ffmpeg not found");
}
const SLOTS = 8;
const slotOf = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % SLOTS; return h; };

export async function stream({ id } = {}) {
  let target = String(id || "");
  if (!/\/play\//.test(target)) {
    const bid = idOf(target);
    if (!bid) throw fail("unavailable", "没有这个音频");
    const detail = await fetchText(`/show/${bid}.html`);
    const first = detail.match(/href="(\/play\/[0-9]+-[0-9]+-[0-9]+\.html)"/);
    if (!first) throw fail("unavailable", "这个专辑没有可播放的章节");
    target = first[1];
  }
  const page = await fetchText(target);
  let u = "";
  const fn = page.match(/var\s+now\s*=\s*FonHen_JieMa\("([^"]*)"\)/i);
  if (fn) u = decodeNow(fn[1]);
  if (!u) u = (page.match(/var\s+now\s*=\s*"([^"]+)"/i) || [])[1] || "";
  if (!u) throw fail("unavailable", "源站没有返回音频地址");
  const type = audioType(u);
  if (type === "mp3") return { url: u, type: "mp3", headers: { referer: abs(target), "user-agent": UA }, title: "" };
  if (!transcodeOn()) return { url: u, type: "m4a", headers: { referer: abs(target), "user-agent": UA }, title: "" };
  const slots = stored("qmtsw:slots", []);
  const key = String(target);
  let slot = slots.indexOf(key);
  if (slot < 0) { slot = slots.findIndex((k) => !k); if (slot < 0) slot = slotOf(key); }
  const path = fileFor(slot);
  try {
    await transcode(u, path, abs(target));
    slots[slot] = key; save("qmtsw:slots", slots);
    return { url: fileURL(path), type: "m4a", title: "" };
  } catch (e) { throw fail("setup", `这一段是 HE-AAC，需要本机安装 ffmpeg 并允许插件运行它 — ${e && e.message ? e.message : e}`); }
}

export function lyrics() { return {}; }
function stored(k, d) { try { const v = host.storage.get(k); return v == null ? d : (typeof v === "string" ? JSON.parse(v) : v); } catch (e) { return d; } }
function save(k, v) { host.storage.set(k, JSON.stringify(v)); }
export function like({ id, on } = {}) { const s = new Set(stored("qmtsw:liked", [])); const k = String(id); if (on) s.add(k); else s.delete(k); save("qmtsw:liked", [...s]); return { id: k, liked: !!on }; }
export function isLiked({ ids } = {}) { const s = new Set(stored("qmtsw:liked", [])); const o = {}; for (const id of ids || []) o[id] = s.has(String(id)); return o; }
export function liked({ offset = 0 } = {}) { const all = stored("qmtsw:liked", []).map((id) => known.get(id)).filter(Boolean); return { tracks: all.slice(offset, offset + 60), more: all.length > offset + 60 }; }
export function played({ id } = {}) { if (!id) return {}; const list = stored("qmtsw:history", []).filter((x) => x !== id); list.push(String(id)); save("qmtsw:history", list.slice(-100)); return {}; }
export function recent() { return stored("qmtsw:history", []).slice().reverse().map((id) => known.get(id)).filter(Boolean).slice(0, 20); }
