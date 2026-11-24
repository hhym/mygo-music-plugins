// 显示名：85听书网（85ting）
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
function unescapeHtml(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function clean(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }
function abs(u) { if (!u) return ""; if (/^https?:/i.test(u)) return u; return BASE + (u.startsWith("/") ? u : "/" + u); }
function numId(v) { const m = String(v || "").match(/\/ting\/(\d+)\.html|\/play\/(\d+)-|\b(\d{3,})\b/); return m ? (m[1] || m[2] || m[3]) : ""; }
function streamType(u) { return /\.m3u8(?:$|\?)/i.test(u) ? "hls" : /\.m4a(?:$|\?)/i.test(u) ? "m4a" : /\.flac(?:$|\?)/i.test(u) ? "flac" : "mp3"; }

// 站点回源经常 503 或者干脆半开连接不返回。之前是 6 轮 × 3 并发、单请求没有超时，
// 最坏能拖到半分钟以上（实测 503 时 26 秒才报错）。改成小预算 + 单请求超时：
// 正常情况下第一次就拿得到，站点挂了 2 秒左右就给出提示。
const REQ_TIMEOUT = 3500;   // 单次请求最多等 3.5 秒
const FAIL_BUDGET = 8000;   // 一轮没成功就按时间预算收敛，不再硬撑六轮
const ROUNDS = 2;
const CONCURRENT = 2;

function fetchOnce(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT);
  const init = {
    method: (opts && opts.method) || "GET",
    headers: { "user-agent": UA, referer: url.replace(/^([^/]+\/\/[^/]+).*/, "$1/"), ...(opts && opts.headers || {}) },
    body: opts && opts.body,
    signal: ctrl.signal,
  };
  return fetch(url, init)
    .then(async (res) => {
      if (!res.ok) throw fail("upstream", `HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 120) throw fail("upstream", "empty body");
      return text;
    })
    .catch((e) => {
      // 超时要给人话，不然界面上只会出现 "This operation was aborted"
      if (e && (e.name === "AbortError" || /abort|超时|timeout/i.test(String(e.message)))) throw fail("timeout", "站点响应超时");
      throw e;
    })
    .finally(() => clearTimeout(timer));
}

async function fetchText(path, opts) {
  const rel = /^https?:/i.test(path) ? path.replace(/^https?:\/\/[^/]+/i, "") : path;
  const ck = rel + "|" + (opts && opts.method || "GET");
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const hosts = ["https://www.85ting.com", "https://85ting.com"];
  let last = null;
  const started = Date.now();
  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0 && Date.now() - started > FAIL_BUDGET) break;
    const host = hosts[round % hosts.length];
    const tasks = Array.from({ length: CONCURRENT }, () => fetchOnce(host + rel, opts));
    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === "fulfilled") { cache.set(ck, { t: Date.now(), v: r.value }); return r.value; }
      last = r.reason;
    }
    if (round < ROUNDS - 1) await waiting(150 + 100 * round);
  }
  if (last && last.code === "timeout") throw fail("unavailable", "站点响应超时或连不上，过一会儿再试");
  throw last || fail("unavailable", "站点暂时无法访问");
}
function parseList(html) {
  const out = []; const seen = new Set();
  const re = /<a[^>]*href="\/ting\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1]; if (seen.has(id)) continue;
    const tag = m[0].slice(0, m[0].indexOf(">") + 1);
    const block = m[2] || "";
    // 标题可能在 a 的 title 属性上，也可能在里面的 span.title / i 里，挨个试
    const title = clean(
      (tag.match(/\btitle="([^"]*)"/i) || [])[1] ||
      (/<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block) || [])[1] ||
      (/<i[^>]*>([\s\S]*?)<\/i>/i.exec(block) || [])[1] ||
      ""
    );
    const img = (block.match(/<img[^>]+data-original="([^"]+)"/i) || tag.match(/<img[^>]+data-original="([^"]+)"/i) || block.match(/<img[^>]+src="([^"]+)"/i) || tag.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || "";
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
    title: "85听书网",
    subtitle: "有声小说与评书",
    sections: [
      { title: "最新更新", tracks: list, albums: albumCards(list), pageTitle: "首页" },
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

// 85听书网的音频来自喜马拉雅，多数是 HE-AAC（SBR/PS），应用自带的 AAC
// 解码器放不了，所以先用 ffmpeg 转成 AAC-LC 再交给播放器。固定几个槽位，
// 避免缓存文件无限增长。
const SLOTS = 8;
const slotOf = (id) => {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % SLOTS;
  return h;
};
function transcodeOn() {
  const v = typeof host.setting === "function" ? host.setting("transcode") : "";
  return v === undefined || v === null || v === "" ? true : String(v) !== "0";
}
const isWindows = /win/i.test(host.platform || "");
const SEP = isWindows ? "\\" : "/";
const fileFor = (slot) => `${String(host.dataDir).replace(/[\\/]+$/, "")}${SEP}85ting-${slot}.m4a`;
function fileURL(path) {
  let p = String(path).replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(p)) p = "/" + p;
  if (!p.startsWith("/")) p = "/" + p;
  return "file://" + p.split("/").map((part) => encodeURIComponent(part).replace(/%3A/gi, ":")).join("/");
}
const FFMPEG_DIRS = {
  darwin: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"],
  linux: ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/snap/bin/ffmpeg"],
  win32: ["ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"],
};
function candidates() {
  const list = [];
  // 播放器自带的 ffmpeg 优先：3.0.94 起宿主会在启动时把它解压好并作为 host.ffmpegPath 给插件，
  // 用户不用再装系统 ffmpeg。
  const builtin = typeof host.ffmpegPath === "string" ? String(host.ffmpegPath) : "";
  if (builtin) list.push(builtin);
  const set = host.setting("ffmpegPath");
  if (set) list.push(String(set));
  if (isWindows) list.push("ffmpeg.exe", "ffmpeg");
  else list.push("ffmpeg");
  for (const p of FFMPEG_DIRS[isWindows ? "win32" : host.platform] || []) list.push(p);
  // 兜底：host.dataDir 是 <数据目录>/plugin-data/<id>，内置 ffmpeg 放在 <数据目录>/ffmpeg/ffmpeg.exe
  if (isWindows) {
    const dd = String(host.dataDir || "");
    const up = dd.replace(/[\\/]plugin-data[\\/].*$/i, "");
    if (up && up !== dd) list.push(up + "\\ffmpeg\\ffmpeg.exe");
  }
  return [...new Set(list)];
}
async function transcode(url, path, referer) {
  if (typeof host.spawn !== "function") throw new Error("host.spawn is not available");
  let last = "";
  for (const bin of candidates()) {
    let p;
    try {
      p = host.spawn(bin, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-headers", `Referer: ${referer}\r\nUser-Agent: ${UA}\r\n`,
        "-i", url,
        "-vn", "-c:a", "aac", "-b:a", "64k",
        "-movflags", "+faststart", path,
      ]);
    } catch (e) { last = `${bin}: ${e}`; continue; }
    if (!p) { last = `${bin}: spawn refused`; continue; }
    let code = 0;
    try { code = await p.wait(); } catch (e) { last = `${bin}: ${e}`; continue; }
    let said = "";
    try { said = (await p.errorOutput()) || ""; } catch {}
    if (code === undefined || code === null || code === 0) {
      if (!said) return;
    }
    last = `${bin}: ${String(said).trim().slice(0, 160) || `exit ${code}`}`;
    console.log(`ffmpeg attempt failed — ${last}`);
  }
  throw new Error(last || "ffmpeg not found");
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
  const raw = (page.match(/var\s+now\s*=\s*"([^"]+)"/i) || [])[1];
  const u = unescapeHtml(raw);
  if (!u) throw fail("unavailable", "源站没有返回音频地址");
  const referer = abs(target);
  if (!transcodeOn()) return { url: u, type: streamType(u), headers: { referer, "user-agent": UA }, title: "" };

  const slots = stored("85ting:slots", []);
  const key = String(target);
  let slot = slots.indexOf(key);
  if (slot < 0) {
    slot = slots.findIndex((k) => !k);
    if (slot < 0) slot = slotOf(key);
  }
  const path = fileFor(slot);
  try {
    await transcode(u, path, referer);
    slots[slot] = key;
    save("85ting:slots", slots);
    return { url: fileURL(path), type: "m4a", title: "" };
  } catch (e) {
    throw fail("setup", `转码失败（音频是 HE-AAC，要靠 ffmpeg 转成 AAC-LC）：先确认播放器自带的 ffmpeg 能跑；如果这台机器上它起不来，装一个系统 ffmpeg 再试 — ${e && e.message ? e.message : e}`);
  }
}

export function lyrics() { return {}; }

const LIKE = "85ting:liked";
const LIKE_T = "85ting:likedTracks";
function stored(k, d) { try { const v = host.storage.get(k); return v == null ? d : (typeof v === "string" ? JSON.parse(v) : v); } catch (e) { return d; } }
function save(k, v) { host.storage.set(k, JSON.stringify(v)); }
export function like({ id, on, name, artists, album, duration } = {}) {
  const s = new Set(stored(LIKE, []));
  const k = String(id);
  if (on) s.add(k); else s.delete(k);
  save(LIKE, [...s]);
  // 顺带把这一集本身存下来：known 只活在内存里，重启后按 id 找回曲目是空的，
  // 「喜欢」页就会整页空着。宿主乐意多传字段就带着，不传也不影响收藏本身。
  const lt = stored(LIKE_T, {});
  if (on && (name || album)) {
    const t = { id: k, name: name || (album && album.name) || "未命名", artists: artists || [], album: album || {}, duration: duration || 0 };
    lt[k] = t; remember([t]);
  } else if (!on && lt[k]) delete lt[k];
  save(LIKE_T, lt);
  return { id: k, liked: !!on };
}
export function isLiked({ ids } = {}) { const s = new Set(stored(LIKE, [])); const o = {}; for (const id of ids || []) o[id] = s.has(String(id)); return o; }
export function liked({ offset = 0 } = {}) {
  const lt = stored(LIKE_T, {});
  const all = stored(LIKE, []).map((id) => known.get(id) || lt[id]).filter(Boolean);
  return { tracks: all.slice(offset, offset + 60), more: all.length > offset + 60 };
}
export function played({ id } = {}) { if (!id) return {}; const list = stored("85ting:history", []).filter((x) => x !== id); list.push(String(id)); save("85ting:history", list.slice(-100)); const t = known.get(String(id)); if (t) save("85ting:historyTracks", { ...stored("85ting:historyTracks", {}), [id]: t }); return {}; }
export function recent() { const ids = stored("85ting:history", []).slice().reverse(); const d = stored("85ting:historyTracks", {}); return ids.map((id) => d[id] || known.get(id)).filter(Boolean).slice(0, 20); }
