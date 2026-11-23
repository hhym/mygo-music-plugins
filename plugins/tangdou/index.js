const API = "https://api-h5.tangdou.com";
const IMG = "https://aimg.tangdou.com";
const WEB = "https://www.tangdou.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = WEB + "/music/";
const TYPES = [
  { id: "1", name: "舞曲推荐" },
  { id: "2", name: "新歌速递" },
];
const TYPE_NAME = Object.fromEntries(TYPES.map((t) => [t.id, t.name]));
const PAGE_SIZE = 30;
const cache = new Map();
const TTL = 5 * 60 * 1000;
const known = new Map();

function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function clean(s) {
  return String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
function coverUrl(u) {
  if (!u) return "";
  if (/^https?:/i.test(u)) return u;
  return IMG + (String(u).startsWith("/") ? String(u) : "/" + String(u));
}
function streamType(u) {
  return /\.m4a(?:$|\?)/i.test(u) ? "m4a" : /\.flac(?:$|\?)/i.test(u) ? "flac" : /\.m3u8(?:$|\?)/i.test(u) ? "hls" : "mp3";
}
function numId(v) {
  return String(v || "").replace(/^tangdou:/, "").replace(/[^\d]/g, "");
}
const waiting = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, params) {
  const qs = new URLSearchParams(params || {}).toString();
  const key = path + "?" + qs;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API + path + (qs ? "?" + qs : ""), {
        headers: { "user-agent": UA, referer: REFERER, accept: "application/json,*/*" },
      });
      if (!res.ok) throw fail("upstream", `HTTP ${res.status}`);
      const body = await res.json();
      if (!body || Number(body.code) !== 0) throw fail("unavailable", (body && body.msg) || "接口没有返回数据");
      cache.set(key, { t: Date.now(), v: body });
      return body;
    } catch (e) { last = e; await waiting(200 + attempt * 300); }
  }
  throw last || fail("unavailable", "糖豆音乐暂时无法访问");
}

function trackOf(d) {
  const id = String(d.id || "");
  const name = clean(d.name) || "未命名歌曲";
  return {
    id,
    name,
    artists: d.author ? [{ id: "", name: clean(d.author) }] : [],
    album: { id, name: "糖豆音乐", imageUrl: coverUrl(d.cover) },
    duration: 0,
  };
}
function remember(list) { for (const t of list || []) known.set(String(t.id), t); }

async function listPage(type, page) {
  const body = await api("/pc/music/list", { page, type, pagesize: PAGE_SIZE });
  const list = (body.datas || []).map(trackOf).filter((t) => t.id && t.name);
  remember(list);
  return list;
}

export async function home() {
  const results = await Promise.allSettled([listPage("1", 1), listPage("2", 1)]);
  const sections = [];
  const names = ["舞曲推荐", "新歌速递"];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length) {
      sections.push({ title: names[i], tracks: r.value, pageTitle: `${names[i]} · 糖豆音乐`, morePage: `type:${i + 1}:2` });
    }
  });
  sections.push({ title: "分类", links: TYPES.map((t) => ({ title: t.name, page: `type:${t.id}:1` })) });
  if (!sections[0] || !sections[0].tracks) throw fail("unavailable", "糖豆音乐暂时没有取到歌曲");
  return { title: "糖豆音乐", subtitle: "广场舞曲与网络新歌", sections };
}

export async function browse({ page } = {}) {
  const raw = String(page || "categories");
  if (raw === "categories") {
    return { title: "分类", sections: [{ title: "分类", links: TYPES.map((t) => ({ title: t.name, page: `type:${t.id}:1` })) }] };
  }
  const m = raw.match(/^type:([0-9]+):(\d+)$/);
  if (!m) throw fail("unavailable", "没有这个页面");
  const type = m[1];
  const pageNo = Math.max(1, Number(m[2]) || 1);
  if (!TYPE_NAME[type]) throw fail("unavailable", "没有这个分类");
  const list = await listPage(type, pageNo);
  return {
    title: TYPE_NAME[type],
    subtitle: `第 ${pageNo} 页`,
    sections: [
      { title: `${TYPE_NAME[type]} · 第 ${pageNo} 页`, tracks: list, morePage: list.length >= PAGE_SIZE ? `type:${type}:${pageNo + 1}` : "" },
      { title: "分类", links: TYPES.map((t) => ({ title: t.name, page: `type:${t.id}:1` })) },
    ],
  };
}

export async function search({ query, kind = "tracks", offset = 0 } = {}) {
  const term = String(query || "").trim();
  if (!term) return { tracks: [], albums: [], more: false };
  if (kind && kind !== "tracks" && kind !== "track" && kind !== "albums") return { tracks: [], albums: [], more: false };
  const needle = term.toLowerCase();
  const pages = [];
  for (const t of TYPES) for (let p = 1; p <= 7; p++) pages.push([t.id, p]);
  const results = await Promise.allSettled(pages.map(([type, page]) => listPage(type, page)));
  const all = [];
  const seen = new Set();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const t of r.value) {
      if (seen.has(t.id)) continue;
      const hay = (t.name + " " + (t.artists[0] ? t.artists[0].name : "")).toLowerCase();
      if (!hay.includes(needle)) continue;
      seen.add(t.id);
      all.push(t);
    }
  }
  remember(all);
  const start = Math.max(0, Number(offset) || 0);
  return { tracks: all.slice(start, start + 60), albums: [], more: all.length > start + 60 };
}

export async function suggest({ query } = {}) {
  try {
    const r = await search({ query, kind: "tracks" });
    return (r.tracks || []).slice(0, 8).map((t) => t.name);
  } catch { return []; }
}

export async function album({ id } = {}) {
  const sid = numId(id);
  if (!sid) throw fail("unavailable", "没有这首歌曲");
  const body = await api("/pc/music/play", { id: sid });
  const d = body.datas || {};
  const t = trackOf(d);
  known.set(t.id, t);
  return {
    album: { id: sid, name: t.name, imageUrl: t.album.imageUrl, artists: t.artists, description: d.word ? clean(d.word) : "" },
    tracks: [t],
  };
}

export async function stream({ id } = {}) {
  const sid = numId(id);
  if (!sid) throw fail("unavailable", "没有这首歌曲");
  const body = await api("/pc/music/play", { id: sid });
  const d = body.datas || {};
  const url = d.play_url || "";
  if (!url) throw fail("unavailable", "这首歌暂时没有可播放的地址，可能需要购买");
  return { url, type: streamType(url), headers: { referer: `${WEB}/musics/${sid}`, "user-agent": UA }, title: clean(d.name) };
}

export async function lyrics({ id } = {}) {
  const sid = numId(id);
  if (!sid) return {};
  try {
    const body = await api("/pc/music/play", { id: sid });
    const word = clean((body.datas || {}).word);
    return word ? { lyrics: word, text: word, source: "糖豆音乐" } : {};
  } catch { return {}; }
}

const LIKE = "tangdou:liked";
function stored(k, d) { try { const v = host.storage.get(k); return v == null ? d : (typeof v === "string" ? JSON.parse(v) : v); } catch { return d; } }
function save(k, v) { host.storage.set(k, JSON.stringify(v)); }
export function like({ id, on } = {}) {
  const s = new Set(stored(LIKE, []));
  const k = String(id);
  if (on) s.add(k); else s.delete(k);
  save(LIKE, [...s]);
  return { id: k, liked: !!on };
}
export function isLiked({ ids } = {}) {
  const s = new Set(stored(LIKE, []));
  const o = {};
  for (const id of ids || []) o[id] = s.has(String(id));
  return o;
}
export function liked({ offset = 0 } = {}) {
  const all = stored(LIKE, []).map((id) => known.get(String(id))).filter(Boolean);
  return { tracks: all.slice(offset, offset + 60), more: all.length > offset + 60 };
}
export function played({ id } = {}) {
  if (!id) return {};
  const k = String(id);
  const list = stored("tangdou:history", []).filter((x) => x !== k);
  list.push(k);
  save("tangdou:history", list.slice(-100));
  const t = known.get(k);
  if (t) save("tangdou:historyTracks", { ...stored("tangdou:historyTracks", {}), [k]: t });
  return {};
}
export function recent() {
  const ids = stored("tangdou:history", []).slice().reverse();
  const d = stored("tangdou:historyTracks", {});
  return ids.map((id) => d[id] || known.get(id)).filter(Boolean).slice(0, 20);
}
