const BASE = "https://www.85ting.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const CATS = [
  { id: "851", name: "言情" },
  { id: "852", name: "武侠" },
  { id: "853", name: "悬疑" },
  { id: "854", name: "历史" },
  { id: "855", name: "军事" },
  { id: "856", name: "评书" },
  { id: "857", name: "相声小品" },
  { id: "858", name: "百家讲坛" },
  { id: "859", name: "商业财经" },
  { id: "8510", name: "健康养生" },
];
const CAT_NAME = Object.fromEntries(CATS.map((c) => [c.id, c.name]));
const cache = new Map();
const TTL = 3 * 60 * 1000;
const known = new Map();
const waiting = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function clean(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }
function abs(u) { if (!u) return ""; if (/^https?:/i.test(u)) return u; return BASE + (u.startsWith("/") ? u : "/" + u); }
function numId(v) { const m = String(v || "").match(/\/ting\/(\d+)\.html|\/play\/(\d+)-|\b(\d{3,})\b/); return m ? (m[1] || m[2] || m[3]) : ""; }
function streamType(u) { return /\.m3u8(?:$|\?)/i.test(u) ? "hls" : /\.m4a(?:$|\?)/i.test(u) ? "m4a" : /\.flac(?:$|\?)/i.test(u) ? "flac" : "mp3"; }

async function fetchText(path, opts) {
  const rel = /^https?:/i.test(path) ? path.replace(/^https?:\/\/[^/]+/i, "") : path;
  const ck = rel + "|" + (opts && opts.method || "GET");
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const hosts = ["https://www.85ting.com", "https://85ting.com"];
  let last = null;
  for (let round = 0; round < 6; round++) {
    const host = hosts[round % hosts.length];
    const tasks = [0, 1, 2].map(async () => {
      const res = await fetch(host + rel, { method: (opts && opts.method) || "GET", headers: { "user-agent": UA, referer: host + "/", ...(opts && opts.headers || {}) }, body: opts && opts.body });
      if (!res.ok) throw fail("upstream", `HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 120) throw fail("upstream", "empty body");
      return text;
    });
    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === "fulfilled") { cache.set(ck, { t: Date.now(), v: r.value }); return r.value; }
      last = r.reason;
    }
    await waiting(150 + 100 * round);
  }
  throw last || fail("unavailable", "站点暂时无法访问");
}
function parseList(html) {
  const out = []; const seen = new Set();
  const re = /<a[^>]+href="\/ting\/(\d+)\.html"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1]; if (seen.has(id)) continue;
    const block = m[3] || "";
    const title = clean(m[2] || (/<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block) || [])[1] || (/<i[^>]*>([\s\S]*?)<\/i>/i.exec(block) || [])[1] || "");
    const img = (block.match(/<img[^>]+data-original="([^"]+)"/i) || block.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || "";
    if (!title) continue;
    seen.add(id);
    const t = { id: `/ting/${id}.html`, name: title, artists: [], album: { id, name: title, imageUrl: /load\.gif/i.test(img) ? "" : abs(img) }, duration: 0 };
    known.set(t.id, t); out.push(t);
  }
  return out;
}

function albumCards(list) { return (list || []).map((t) => ({ id: t.album.id, name: t.album.name, imageUrl: t.album.imageUrl, artists: t.artists || [] })); }
function remember(list) { for (const t of list || []) known.set(t.id, t); }

function maxPage(html, catId) {
  let max = 1;
  const re = new RegExp(`/list/${catId}-(\\d+)\\.html`, "g");
  for (const m of String(html).matchAll(re)) max = Math.max(max, Number(m[1]) || 1);
  return max;
}

export async function home() {
  const html = await fetchText("/");
  const list = parseList(html).slice(0, 30);
  remember(list);
  return {
    title: "畅听网",
    subtitle: "有声小说与评书",
    sections: [
      { title: "最新更新", tracks: list, albums: albumCards(list), pageTitle: "畅听网" },
      { title: "分类", links: CATS.map((c) => ({ title: c.name, page: `cat:${c.id}:1` })) },
    ],
  };
}

export async function browse({ page } = {}) {
  const raw = String(page || "categories");
  if (raw === "categories") return { title: "分类", sections: [{ title: "分类", links: CATS.map((c) => ({ title: c.name, page: `cat:${c.id}:1` })) }] };
  const m = raw.match(/^cat:([0-9]+):(\d+)$/);
  if (!m) throw fail("unavailable", "没有这个页面");
  const cid = m[1]; const pageNo = Math.max(1, Number(m[2]) || 1);
  if (!CAT_NAME[cid]) throw fail("unavailable", "没有这个分类");
  const path = pageNo === 1 ? `/list/${cid}.html` : `/list/${cid}-${pageNo}.html`;
  const html = await fetchText(path);
  const list = parseList(html); remember(list);
  const max = maxPage(html, cid);
  return {
    title: CAT_NAME[cid],
    subtitle: `第 ${pageNo} 页`,
    sections: [
      { title: `${CAT_NAME[cid]} · 第 ${pageNo} 页`, tracks: list, albums: albumCards(list), morePage: pageNo < max ? `cat:${cid}:${pageNo + 1}` : "" },
      { title: "分类", links: CATS.map((c) => ({ title: c.name, page: `cat:${c.id}:1` })) },
    ],
  };
}

export async function search({ query, kind = "tracks", offset = 0 } = {}) {
  const term = String(query || "").trim();
  if (!term) return { tracks: [], albums: [], more: false };
  if (kind && kind !== "tracks" && kind !== "track" && kind !== "albums") return { tracks: [], albums: [], more: false };
  const body = new URLSearchParams({ searchword: term }).toString();
  const html = await fetchText("/search.php", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const list = parseList(html); remember(list);
  return { tracks: list, albums: albumCards(list), more: false };
}

export async function suggest({ query } = {}) {
  const term = String(query || "").trim();
  if (!term) return [];
  try { return ((await search({ query: term, kind: "albums" })).albums || []).slice(0, 8).map((a) => a.name); } catch (e) { return []; }
}

export async function album({ id } = {}) {
  const bid = numId(id); if (!bid) throw fail("unavailable", "没有这个专辑");
  const html = await fetchText(`/ting/${bid}.html`);
  const name = clean((html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i) || [])[1]) || clean((html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const cover = abs((html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i) || [])[1] || "");
  const type = clean((html.match(/<meta\s+property="og:video:class"\s+content="([^"]*)"/i) || [])[1] || "");
  const desc = clean((html.match(/<div[^>]+class="ee"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "");
  const speaker = clean((html.match(/主播\s*:\s*([^ <",]+)/i) || html.match(/<i[^>]*class="[^"]*fa-user[^"]*"[^>]*><\/i>\s*([^<]+)/i) || [])[1] || "");

  const tracks = []; const seen = new Set();
  const re = /<a[^>]+(?:title="([^"]*)")?[^>]+href="(\/play\/[0-9]+-[0-9]+-[0-9]+\.html)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const link = m[2]; if (seen.has(link)) continue; seen.add(link);
    const title = clean(m[1] || m[3] || `第 ${tracks.length + 1} 集`);
    tracks.push({ id: link, name: title, artists: speaker ? [{ id: "", name: speaker }] : [], album: { id: bid, name, imageUrl: cover }, duration: 0 });
  }

  const alb = { id: bid, name: name || "未命名专辑", imageUrl: cover, artists: speaker ? [{ id: "", name: speaker }] : [], description: [type, desc.replace(/^剧情简介\s*:\s*/, "")].filter(Boolean).join(" · ") };
  return { album: alb, tracks };
}

export async function stream({ id } = {}) {
  let target = String(id || "");
  if (!/\/play\//.test(target)) {
    const bid = numId(target);
    if (!bid) throw fail("unavailable", "没有这个音频");
    const detail = await fetchText(`/ting/${bid}.html`);
    const first = detail.match(/href="(\/play\/[0-9]+-[0-9]+-[0-9]+\.html)"/);
    if (!first) throw fail("unavailable", "这个专辑没有可播放的章节");
    target = first[1];
  }
  const page = await fetchText(target);
  const u = (page.match(/var\s+now\s*=\s*"([^"]+)"/i) || [])[1];
  if (!u) throw fail("unavailable", "源站没有返回音频地址");
  return { url: u, type: streamType(u), headers: { referer: abs(target), "user-agent": UA }, title: "" };
}

export function lyrics() { return {}; }

const LIKE = "85ting:liked";
function stored(k, d) { try { const v = host.storage.get(k); return v == null ? d : (typeof v === "string" ? JSON.parse(v) : v); } catch (e) { return d; } }
function save(k, v) { host.storage.set(k, JSON.stringify(v)); }
export function like({ id, on } = {}) { const s = new Set(stored(LIKE, [])); const k = String(id); if (on) s.add(k); else s.delete(k); save(LIKE, [...s]); return { id: k, liked: !!on }; }
export function isLiked({ ids } = {}) { const s = new Set(stored(LIKE, [])); const o = {}; for (const id of ids || []) o[id] = s.has(String(id)); return o; }
export function liked({ offset = 0 } = {}) { const all = stored(LIKE, []).map((id) => known.get(id)).filter(Boolean); return { tracks: all.slice(offset, offset + 60), more: all.length > offset + 60 }; }
export function played({ id } = {}) { if (!id) return {}; const list = stored("85ting:history", []).filter((x) => x !== id); list.push(String(id)); save("85ting:history", list.slice(-100)); const t = known.get(String(id)); if (t) save("85ting:historyTracks", { ...stored("85ting:historyTracks", {}), [id]: t }); return {}; }
export function recent() { const ids = stored("85ting:history", []).slice().reverse(); const d = stored("85ting:historyTracks", {}); return ids.map((id) => d[id] || known.get(id)).filter(Boolean).slice(0, 20); }
