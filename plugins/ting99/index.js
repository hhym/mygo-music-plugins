const SITE = {"id": "ting99", "name": "99听书网", "base": "https://www.ting99.com", "homePath": "/", "categories": [{"name": "玄幻", "path": "/fenlei/1.html"}, {"name": "言情", "path": "/fenlei/2.html"}, {"name": "都市", "path": "/fenlei/3.html"}, {"name": "恐怖", "path": "/fenlei/4.html"}, {"name": "惊悚", "path": "/fenlei/5.html"}, {"name": "推理", "path": "/fenlei/6.html"}, {"name": "武侠", "path": "/fenlei/7.html"}, {"name": "历史", "path": "/fenlei/8.html"}, {"name": "军事", "path": "/fenlei/9.html"}, {"name": "穿越", "path": "/fenlei/10.html"}, {"name": "科幻", "path": "/fenlei/11.html"}, {"name": "网游", "path": "/fenlei/12.html"}, {"name": "评书", "path": "/fenlei/13.html"}, {"name": "戏曲", "path": "/fenlei/14.html"}, {"name": "笑话", "path": "/fenlei/15.html"}, {"name": "儿童", "path": "/fenlei/16.html"}, {"name": "财经", "path": "/fenlei/17.html"}, {"name": "广播", "path": "/fenlei/18.html"}, {"name": "诗歌", "path": "/fenlei/19.html"}, {"name": "文学", "path": "/fenlei/20.html"}, {"name": "粤语", "path": "/fenlei/21.html"}, {"name": "经典", "path": "/fenlei/22.html"}, {"name": "相声小品", "path": "/fenlei/23.html"}, {"name": "百家讲坛", "path": "/fenlei/24.html"}], "search": {"method": "POST", "path": "/search.php", "field": "searchword"}};

const BASE = SITE.base;
const NAME = SITE.name;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const cache = new Map();
const known = new Map();
const TTL = 3 * 60 * 1000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function clean(s) {
  return String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}
function abs(u) {
  if (!u) return "";
  u = String(u).trim();
  if (/^https?:/i.test(u)) return u;
  if (u.startsWith("//")) return "https:" + u;
  return BASE + (u.startsWith("/") ? u : "/" + u);
}
function remember(list) { for (const a of list || []) if (a && a.id) known.set(a.id, a); }

async function fetchText(path, opts) {
  const rel = /^https?:/i.test(path) ? path.replace(/^https?:\/\/[^/]+/i, "") : path;
  const key = rel + "|" + ((opts && opts.method) || "GET") + "|" + ((opts && opts.body) || "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let last = null;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(BASE + rel, {
        method: (opts && opts.method) || "GET",
        headers: { "user-agent": UA, referer: REFERER, ...((opts && opts.headers) || {}) },
        body: opts && opts.body,
      });
      if (!res.ok) throw fail("upstream", `HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 100) throw fail("upstream", "empty body");
      if (/系统安全验证|Just a moment/i.test(text)) throw fail("unavailable", "源站要求安全验证");
      cache.set(key, { t: Date.now(), v: text });
      return text;
    } catch (e) { last = e; await wait(500 + i * 700); }
  }
  throw last || fail("unavailable", `${NAME}暂时无法访问`);
}

const CAT_FALLBACK = SITE.categories || [];
function catLinks() {
  return CAT_FALLBACK.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.name + "|" + c.path)}:1` }));
}
function parseCats(html) {
  if (CAT_FALLBACK.length) return CAT_FALLBACK;
  const out = []; const seen = new Set();
  const add = (path, name) => {
    name = clean(name);
    if (!name || name.length > 12 || seen.has(path)) return;
    if (/首页|排行|全部|更多|登录|注册|收藏|地图|RSS|留言|搜索|最新|下载|手机版/.test(name)) return;
    seen.add(path); out.push({ name, path });
  };
  let m; let re;
  re = /<a[^>]+href="\/(fenlei|yi)\/(\d+)\.html"[^>]*>([^<]{1,12})<\/a>/gi;
  while ((m = re.exec(html))) add(`/${m[1]}/${m[2]}.html`, m[3]);
  if (!out.length) {
    re = /<a[^>]+href="\/book\/([a-z0-9_]+)\/lastupdate\.html"[^>]*>([^<]{1,12})<\/a>/gi;
    while ((m = re.exec(html))) add(`/book/${m[1]}/lastupdate.html`, m[2]);
  }
  if (!out.length) {
    re = /<a[^>]+href="\/([a-z][a-z0-9_]*)\/"[^>]*>([^<]{2,12})<\/a>/gi;
    while ((m = re.exec(html))) {
      if (/^(book|mp3|tingshu|play|yun|search|top|user|over|tingdan|boyin|fenlei|yi|public|template|uploads|xml|news|tag|special|list|html|gbook)$/i.test(m[1])) continue;
      add(`/${m[1]}/`, m[2]);
    }
  }
  return out.slice(0, 30);
}

function idFromHref(href) {
  let m = String(href || "").match(/^\/(book|mp3|tingshu)\/(\d+)\.html/i);
  if (m) return `album:${m[1].toLowerCase()}:${m[2]}`;
  m = String(href || "").match(/^\/([a-z0-9_]+)\/(\d+)\.html/i);
  if (m && !/^(fenlei|yi|list|book|mp3|tingshu|play|yun|search|top|user|over|tingdan|boyin|public|template|uploads|xml|news|tag|special|html)$/i.test(m[1])) return `album:cat:${m[1]}:${m[2]}`;
  return "";
}
function hrefFromId(id) {
  const m = String(id || "").match(/^album:(book|mp3|tingshu):(\d+)$/);
  if (m) return `/${m[1]}/${m[2]}.html`;
  const c = String(id || "").match(/^album:cat:([a-z0-9_]+):(\d+)$/i);
  if (c) return `/${c[1]}/${c[2]}.html`;
  return "";
}
function bidFromId(id) {
  const m = String(id || "").match(/(?:album:(?:book|mp3|tingshu|cat):(?:[a-z0-9_]+:)?)(\d+)/i);
  return m ? m[1] : "";
}
function makeCard(id, name, image) { return { id, name: clean(name) || "未命名专辑", imageUrl: abs(image), artists: [] }; }

function parseCards(html) {
  const out = []; const seen = new Set();
  const re = /<a\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const href = (attrs.match(/href="([^"]+)"/i) || [])[1] || "";
    const id = idFromHref(href);
    if (!id || seen.has(id)) continue;
    const tail = html.slice(m.index, m.index + 750);
    const title = (attrs.match(/title="([^"]+)"/i) || [])[1] || "";
    const alt = (tail.match(/<img[^>]+alt="([^"]*)"/i) || [])[1] || "";
    const inner = clean((tail.slice(tail.indexOf(">") + 1).split("</a>")[0] || ""));
    const name = clean(title || alt || inner).replace(/\s*更至\s*\d+\s*集$/, "");
    if (!name) continue;
    const img = ((tail.match(/<img[^>]+(?:data-original|data-src|src)="([^"]+)"/i) || [])[1] || (tail.match(/<a[^>]+(?:data-original|data-src)="([^"]+)"/i) || [])[1] || "");
    seen.add(id); out.push(makeCard(id, name, img));
  }
  return out;
}

export async function home() {
  const html = await fetchText(SITE.homePath || "/");
  const list = parseCards(html).slice(0, 30);
  const cats = parseCats(html).slice(0, 30);
  if (!list.length) throw fail("unavailable", "首页没有解析到内容，源站可能改版");
  remember(list);
  const sections = [{ title: "最新推荐", albums: list }];
  if (cats.length) sections.push({ title: "分类", links: cats.map((c) => ({ title: c.name, page: `cat:${encodeURIComponent(c.name + "|" + (c.path || ""))}:1` })) });
  return { title: NAME, subtitle: "有声小说 · 评书", sections };
}

function parseCatPage(raw) {
  const m = String(raw || "").match(/^cat:([^:]+):(\d+)$/);
  if (!m) return null;
  const key = decodeURIComponent(m[1]);
  const [name, path] = key.split("|");
  return { name, path, page: Number(m[2]) || 1 };
}
export async function browse({ page } = {}) {
  if (!page || page === "categories") {
    return { title: "分类", sections: [{ title: "全部分类", links: catLinks() }] };
  }
  const cat = parseCatPage(page);
  if (!cat) throw fail("unavailable", "没有这个页面");
  let path = cat.path;
  if (cat.page > 1) path = path.replace(/(\.html|\/)$/, `-${cat.page}$1`).replace(/-1\.html$/, ".html");
  const html = await fetchText(path);
  const list = parseCards(html);
  remember(list);
  return { title: cat.name, subtitle: `第 ${cat.page} 页`, sections: [{ title: `${cat.name} · 第 ${cat.page} 页`, albums: list }] };
}

export async function search({ query, kind = "albums", offset = 0 } = {}) {
  const term = String(query || "").trim();
  if (!term) return { tracks: [], albums: [], more: false };
  if (kind && kind !== "albums" && kind !== "album") return { tracks: [], albums: [], more: false };
  const local = [...known.values()].filter((a) => a.name.toLowerCase().includes(term.toLowerCase())).slice(0, 30);
  if (local.length) return { albums: local, more: false };
  let found = [];
  try {
    const s = SITE.search;
    if (s && s.method === "POST") {
      const body = new URLSearchParams(); body.set(s.field || "searchword", term);
      const html = await fetchText(s.path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
      found = parseCards(html);
    } else {
      const field = (s && s.field) || "searchword";
      const html = await fetchText(`${(s && s.path) || "/search.php"}?${field}=${encodeURIComponent(term)}`);
      found = parseCards(html);
    }
  } catch (e) {}
  if (found.length) { remember(found); return { albums: found.slice(0, 30), more: false }; }
  const cats = CAT_FALLBACK.length ? CAT_FALLBACK : [];
  const all = []; const seen = new Set();
  if (cats.length) {
    const parts = await Promise.all(cats.slice(0, 10).map((c) => fetchText(c.path).then(parseCards).catch(() => [])));
    for (const p of parts) for (const a of p) { if (!seen.has(a.id)) { seen.add(a.id); all.push(a); } }
    const hits = all.filter((a) => a.name.toLowerCase().includes(term.toLowerCase()));
    return { albums: hits.slice(0, 30), more: false };
  }
  return { albums: [], more: false };
}

export async function suggest({ query } = {}) { const r = await search({ query }); return r.albums || []; }

const TRACK_RES = [
  /href=['"](\/play\/[0-9]+-0-[0-9]+\.html)['"][^>]*>([\s\S]*?)<\/a>/gi,
  /href=['"](\/[a-z0-9_]+\/[0-9]+\/0-[0-9]+\.html)['"][^>]*>([\s\S]*?)<\/a>/gi,
  /href=['"](\/tingshu\/[0-9]+\/[0-9]+\.html)['"][^>]*>([\s\S]*?)<\/a>/gi,
  /href=['"](\/book\/[0-9]+\/[0-9]+\.html)['"][^>]*>([\s\S]*?)<\/a>/gi,
  /href=['"](\/yun\/[0-9]+-0-[0-9]+\.html)['"][^>]*>([\s\S]*?)<\/a>/gi,
];
function parseTracks(html, bid, name, cover, speaker) {
  const tracks = []; const seen = new Set();
  for (const re of TRACK_RES) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(html))) {
      const link = m[1];
      if (seen.has(link)) continue;
      if (bid && !link.includes(`/${bid}/`) && !link.includes(`-${bid}-`) && !new RegExp(`/${bid}-`).test(link) && !new RegExp(`/${bid}/`).test(link)) continue;
      seen.add(link);
      const tag = m[0].slice(0, m[0].indexOf(">") + 1);
      const title = (tag.match(/title=["']([^"']*)["']/) || [])[1] || "";
      let nm = clean(title) || clean(m[2]) || `第 ${tracks.length + 1} 集`;
      nm = nm.replace(/^.*?章节[_-]/, "").replace(/在线收听$/, "").trim();
      if (nm === "开始收听") nm = `第 ${tracks.length + 1} 集`;
      else if (/^(立即播放|播放|下载|查看全部章节)$/.test(nm)) continue;
      tracks.push({ id: link, name: nm, artists: speaker ? [{ id: "", name: speaker }] : [], album: { id: `album:${bid}`, name, imageUrl: cover }, duration: 0 });
    }
  }
  return tracks;
}

export async function album({ id } = {}) {
  const path = hrefFromId(id);
  if (!path) throw fail("unavailable", "没有这个专辑");
  const html = await fetchText(path);
  let name = clean((html.match(/<h1[^>]*>([^<]*)/i) || [])[1]);
  if (!name) name = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).split(/[-_|]/)[0];
  name = name.replace(/有声小说|全集/g, "").trim();
  const parsedCover = abs((html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || html.match(/<img[^>]+(?:class="(?:imgd|lazyload|imga|bookimg)"|data-original|data-src)[^>]+(?:src|data-original|data-src)="([^"]+)"/i) || html.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || "");
  const cover = (known.get(id) && known.get(id).imageUrl) || parsedCover;
  const speaker = clean((html.match(/(?:播音|演播|主播)[：:]\s*(?:<[^>]+>)*\s*([^<<\s]{1,20})/i) || [])[1] || "");
  const desc = clean((html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1] || "");
  const bid = bidFromId(id);
  let tracks = parseTracks(html, bid, name, cover, speaker);
  const dir = (html.match(/href="(\/bookdir\/[^"]+\.html)"/i) || [])[1];
  if (tracks.length < 30 && dir) {
    try {
      const more = await fetchText(dir);
      const t2 = parseTracks(more, bid, name, cover, speaker);
      const seen = new Set(tracks.map((t) => t.id));
      for (const t of t2) if (!seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
    } catch (e) {}
  }
  if (!tracks.length) throw fail("unavailable", "这个专辑没有可播放章节");
  known.set(id, { id, name, imageUrl: cover, artists: speaker ? [{ id: "", name: speaker }] : [] });
  return { album: { id, name, imageUrl: cover, artists: speaker ? [{ id: "", name: speaker }] : [], description: desc }, tracks };
}

function decodeNow(s) { return String(s || "").split("*").filter(Boolean).map((n) => String.fromCharCode(Number(n))).join(""); }
function audioType(u) { if (/\.mp3(?:$|\?)/i.test(u)) return "mp3"; if (/\.m4a(?:$|\?)/i.test(u)) return "m4a"; if (/\.aac(?:$|\?)/i.test(u)) return "aac"; return "mp3"; }
function looksAudio(u) {
  if (!u) return false;
  if (!/^\.|^https?:|^\/|^\/\//i.test(String(u))) return false;
  if (/\.(?:m4a|mp3|aac|ogg|wav)(?:[?#]|$)/i.test(u)) return true;
  return false;
}
function extractAudio(html) {
  let m;
  m = html.match(/var\s+now\s*=\s*FonHen_JieMa\(["']([^"']*)["']\)/i); if (m) return decodeNow(m[1]);
  for (const re of [
    /var\s+(?:now|url|mp3|audio|playurl)\s*=\s*["']([^"']+)["']/i,
    /["'](?:url|audio|mp3|playurl)["']\s*:\s*["']([^"']+)["']/i,
    /<audio[^>]+src=["']([^"']+)["']/i,
    /<source[^>]+src=["']([^"']+)["']/i,
  ]) { m = html.match(re); if (m && looksAudio(m[1])) return m[1]; }
  m = html.match(/https?:\/\/[^"'\s<>]+\.(?:m4a|mp3|aac|ogg|wav)(?:\?[^"'\s<>]*)?/i); if (m) return m[0];
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
function fileFor(slot) { return `${String(host.dataDir).replace(/[\\/]+$/, "")}${isWindows() ? "\\" : "/"}${SITE.id}-${slot}.m4a`; }
function fileURL(path) { let p = String(path).replace(/\\/g, "/"); if (!p.startsWith("/")) p = "/" + p; return "file://" + p.split("/").map((x) => encodeURIComponent(x).replace(/%3A/gi, ":")).join("/"); }
function transcodeOn() { const v = host.setting("transcode"); return v == null || v === "" ? true : String(v) !== "0"; }
async function transcode(url, path, referer) {
  let last = "";
  for (const bin of [...(host.setting("ffmpegPath") ? [host.setting("ffmpegPath")] : []), "ffmpeg", ...(FFMPEG[host.platform] || [])]) {
    try {
      const p = host.spawn(bin, ["-y", "-hide_banner", "-loglevel", "error", "-headers", `Referer: ${referer}\r\n`, "-user_agent", UA, "-i", url, "-vn", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", path]);
      const code = await p.wait(); const err = await p.errorOutput();
      if ((code == null || code === 0) && !err) return;
      last = `${bin}: ${String(err).slice(0, 160) || code}`;
    } catch (e) { last = `${bin}: ${e && e.message ? e.message : e}`; }
  }
  throw new Error(last || "ffmpeg not found");
}

export async function stream({ id } = {}) {
  let target = String(id || "");
  if (!/^\//.test(target)) {
    const a = await album({ id: target });
    if (!a.tracks.length) throw fail("unavailable", "这个专辑没有章节");
    target = a.tracks[0].id;
  }
  let page = await fetchText(target);
  let u = extractAudio(page);
  if (!u) {
    const iframe = (page.match(/<iframe[^>]+src="([^"]+)"/i) || [])[1];
    if (iframe) {
      const p2 = await fetchText(abs(iframe));
      u = extractAudio(p2);
    }
  }
  if (!u) throw fail("unavailable", "源站没有返回音频地址，该站可能已关闭在线播放");
  u = abs(u);
  const type = audioType(u);
  const headers = { referer: abs(target), "user-agent": UA };
  if (type === "mp3" || type === "aac") return { url: u, type, headers, title: "" };
  if (!transcodeOn()) return { url: u, type, headers, title: "" };
  const all = slots(); let slot = all.indexOf(target);
  if (slot < 0) { slot = all.findIndex((x) => !x); if (slot < 0) slot = slotOf(target); }
  try {
    const path = fileFor(slot);
    await transcode(u, path, abs(target));
    all[slot] = target; saveSlots(all);
    return { url: fileURL(path), type: "m4a", title: "" };
  } catch (e) { throw fail("setup", `本段需要 ffmpeg 转码：${e && e.message ? e.message : e}`); }
}

export function lyrics() { return {}; }
function stored(k, d) { try { const v = host.storage.get(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function like({ id, on } = {}) { const s = new Set(stored("liked", [])); if (on) s.add(String(id)); else s.delete(String(id)); host.storage.set("liked", JSON.stringify([...s])); return { id: String(id), liked: !!on }; }
export function isLiked({ ids } = {}) { const s = new Set(stored("liked", [])); const o = {}; for (const id of ids || []) o[id] = s.has(String(id)); return o; }
export function liked({ offset = 0 } = {}) { const all = stored("liked", []).map((id) => known.get(id)).filter(Boolean); return { tracks: all.slice(offset, offset + 60), more: all.length > offset + 60 }; }
export function played({ id } = {}) { if (!id) return {}; const list = stored("history", []).filter((x) => x !== id); list.push(String(id)); host.storage.set("history", JSON.stringify(list.slice(-100))); return {}; }
export function recent() { return stored("history", []).slice().reverse().map((id) => known.get(id)).filter(Boolean).slice(0, 20); }
