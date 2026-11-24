// 显示名：听友听书（tingyou）
const CFG = {
  id: "tingyou",
  name: "听友听书",
  base: "https://www.tingyou.fm",
  subtitle: "有声小说、评书、广播剧",
};

const BASE = CFG.base;
const API = BASE + "/listening-api";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const REFERER = BASE + "/listening";
const SUGGEST_TTL = 10 * 60 * 1000;

const CATS = [
  { id: "2", name: "有声小说" },
  { id: "1", name: "评书" },
];
const SORTS = [
  { key: "popular", name: "播放最多" },
  { key: "new", name: "最新发布" },
  { key: "updated", name: "最近更新" },
];

const knownTracks = new Map();

function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function stored(k, f) { const v = host.storage.get(k); return v === undefined || v === null ? f : v; }
function keep(k, v) { host.storage.set(k, v); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function clean(s) { return String(s == null ? "" : s).replace(/[\s\u00a0]+/g, " ").trim(); }
function catName(id) { const c = CATS.find((x) => x.id === String(id)); return c ? c.name : "分类"; }
function sortName(key) { const s = SORTS.find((x) => x.key === key); return s ? s.name : "综合"; }

/* ---------------------------------------------------------------- api */

async function json(path, opts) {
  const o = opts || {};
  const url = path.startsWith("http") ? path : API + path;
  let last = "";
  for (let i = 0; i < 3; i++) {
    try {
      const headers = {
        "user-agent": UA,
        referer: o.referer || REFERER,
        accept: "application/json",
        "accept-language": "zh-CN,zh;q=0.9",
        "x-listening-timezone": "Asia/Shanghai",
      };
      if (o.body) headers["content-type"] = "application/json";
      const res = await fetch(url, {
        method: o.method || "GET",
        headers,
        body: o.body ? JSON.stringify(o.body) : undefined,
      });
      const text = await res.text();
      if (res.status >= 500) { last = "站点返回了 " + res.status; await wait(600 * (i + 1)); continue; }
      if (!res.ok) throw fail("unavailable", "接口返回了 " + res.status);
      try { return JSON.parse(text); } catch (e) { throw fail("unavailable", "接口返回的不是 JSON"); }
    } catch (e) {
      if (e && e.code) throw e;
      last = (e && e.message) || String(e);
      await wait(600 * (i + 1));
    }
  }
  throw fail("unavailable", last || "接口请求失败");
}

/* ---------------------------------------------------------------- models */

function albumOf(it) {
  const src = it || {};
  return {
    id: String(src.id != null ? src.id : (src.album_id != null ? src.album_id : "")),
    name: clean(src.title || src.name || "未命名专辑"),
    author: clean(src.author || ""),
    teller: clean(src.teller || ""),
    cover: String(src.cover_url || src.cover || "").replace(/\\\//g, "/"),
    count: Number(src.count || 0),
    type: clean(src.type || ""),
    cat: clean(src.cat || ""),
    status: Number(src.status != null ? src.status : 0),
    updated: Number(src.updated_at || 0),
    synopsis: clean(src.synopsis || src.description || src.intro || ""),
  };
}

function albumTrack(a) {
  const t = {
    id: a.id,
    name: a.name,
    artists: a.teller ? [{ name: a.teller }] : [],
    album: { id: a.id, name: a.name, imageUrl: a.cover || "" },
    duration: 0,
  };
  knownTracks.set(t.id, t);
  return t;
}

function trackOf(a, idx, title, duration) {
  const t = {
    id: a.id + ":" + idx,
    name: clean(title || ("第 " + idx + " 集")),
    artists: a.teller ? [{ name: a.teller }] : [],
    album: { id: a.id, name: a.name, imageUrl: a.cover || "" },
    duration: Number(duration || 0),
  };
  knownTracks.set(t.id, t);
  return t;
}

function remember(list) { for (const t of list || []) if (t && t.id) knownTracks.set(String(t.id), t); }
function trackBy(id) { return knownTracks.get(String(id)) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null; }

function noteOf(a) {
  return [
    a.teller ? "播讲：" + a.teller : "",
    a.author ? "作者：" + a.author : "",
    [a.type, a.cat].filter(Boolean).join(" · "),
    a.count ? "共 " + a.count + " 集" : "",
  ].filter(Boolean).join(" · ");
}

function albumCard(id, name, imageUrl) {
  return { id: id, name: name, artists: [], album: { id: id, name: name, imageUrl: imageUrl || "" }, duration: 0 };
}

/* ---------------------------------------------------------------- views */

export async function home() {
  const sections = [];
  let latest = null;
  try { latest = await json("/rank?section=latest&page=1"); } catch (e) { latest = null; }
  const latestList = (latest && latest.items ? latest.items : []).map(albumOf).filter((a) => a.id);
  if (latestList.length) sections.push({ title: "最新更新", tracks: latestList.map(albumTrack) });
  let hot = null;
  try { hot = await json("/rank?section=hot&page=1"); } catch (e) { hot = null; }
  const hotList = [];
  const hotIds = new Set(latestList.map((a) => a.id));
  for (const a of (hot && hot.items) || []) {
    const al = albumOf(a);
    if (!al.id || hotIds.has(al.id)) continue;
    hotIds.add(al.id);
    hotList.push(al);
  }
  if (hotList.length) sections.push({ title: "热门播放", tracks: hotList.map(albumTrack) });
  sections.push({
    title: "分类",
    links: [{ title: "有声小说", page: "cat:2:popular:1" }, { title: "评书", page: "cat:1:popular:1" }, { title: "全部分类", page: "categories" }],
  });
  return { title: CFG.name, subtitle: CFG.subtitle, sections };
}

export async function browse(args) {
  const raw = String((args && args.page) || "");
  if (!raw || raw === "categories") {
    const sections = [];
    for (const c of CATS) {
      sections.push({ title: c.name, links: SORTS.map((s) => ({ title: s.name, page: "cat:" + c.id + ":" + s.key + ":1" })) });
    }
    sections.push({ title: "榜单", links: [{ title: "最新更新", page: "rank:latest:1" }, { title: "热门播放", page: "rank:hot:1" }] });
    return { title: CFG.name + "分类", sections };
    }

  const cat = /^cat:([0-9]+):([a-z]+):([0-9]+)$/.exec(raw);
  if (cat) {
    const catId = cat[1], sort = cat[2], pageNo = Number(cat[3]) || 1;
    const data = await json("/category?category=" + encodeURIComponent(catId) + "&sort=" + encodeURIComponent(sort) + "&page=" + pageNo);
    const items = (data.data || data.items || []).map(albumOf).filter((a) => a.id);
    remember(items.map(albumTrack));
    const pages = Number(data.pages || 1);
    const sections = [{ title: catName(catId), tracks: items.map(albumTrack) }];
    const more = [];
    if (pageNo < pages) more.push({ title: "下一页", page: "cat:" + catId + ":" + sort + ":" + (pageNo + 1) });
    more.push({ title: "播放最多", page: "cat:" + catId + ":popular:1" }, { title: "最新发布", page: "cat:" + catId + ":new:1" }, { title: "全部分类", page: "categories" });
    sections.push({ title: "更多", links: more });
    return { title: catName(catId), subtitle: CFG.name + " · " + sortName(sort) + " · 第 " + pageNo + " 页", sections };
  }

  const rank = /^rank:([a-z]+):([0-9]+)$/.exec(raw);
  if (rank) {
    const section = rank[1], pageNo = Number(rank[2]) || 1;
    const data = await json("/rank?section=" + encodeURIComponent(section) + "&page=" + pageNo);
    const items = (data.items || []).map(albumOf).filter((a) => a.id);
    const label = section === "hot" ? "热门播放" : "最新更新";
    const sections = [{ title: label, tracks: items.map(albumTrack) }];
    const links = [{ title: "全部分类", page: "categories" }];
    if (data.has_more) links.unshift({ title: "下一页", page: "rank:" + section + ":" + (pageNo + 1) });
    sections.push({ title: "更多", links });
    return { title: label, subtitle: CFG.name + " · 第 " + pageNo + " 页", sections };
  }

  throw fail("unavailable", "没有这个页面");
}

export async function album(args) {
  const raw = String((args && args.id) || "");
  const albumId = raw.split(":")[0];
  if (!/^[0-9]+$/.test(albumId)) throw fail("invalid", "没有这本专辑");
  const info = albumOf(await json("/album/" + albumId));
  const chs = await json("/chapters/" + albumId);
  const list = (chs.chapters || [])
    .map((c) => trackOf(info, Number(c.index) || 1, c.title, c.duration))
    .sort((a, b) => Number(a.id.split(":")[1]) - Number(b.id.split(":")[1]));
  remember(list);
  return {
    album: {
      id: info.id,
      name: info.name,
      imageUrl: info.cover || undefined,
      artists: info.teller ? [{ name: info.teller }] : undefined,
      description: [info.synopsis, noteOf(info)].filter(Boolean).join("\n"),
    },
    tracks: list,
  };
}

export async function stream(args) {
  const raw = String((args && args.id) || "");
  const parts = raw.split(":");
  let albumId = parts[0];
  let idx = Number(parts[1] || 0);
  if (!/^[0-9]+$/.test(albumId)) throw fail("invalid", "没有这一集");
  if (!idx) {
    const t = trackBy(raw);
    if (t && /^[0-9]+:[0-9]+$/.test(t.id)) { albumId = t.id.split(":")[0]; idx = Number(t.id.split(":")[1]); }
  }
  if (!idx) {
    const chs = await json("/chapters/" + albumId);
    const first = (chs.chapters || [])[0];
    idx = Number(first && first.index) || 1;
  }
  const res = await json("/play", { method: "POST", body: { album_id: albumId, chapter_idx: idx } });
  const url = String(res.play_url || "").replace(/\\\//g, "/");
  if (!/^https?:/i.test(url)) throw fail("unavailable", "接口没有给播放地址");
  const a = trackBy(albumId + ":" + idx);
  return {
    url: url,
    type: "mp3",
    headers: { referer: BASE + "/", "user-agent": UA },
    title: (a && a.name) || "",
  };
}

export async function search(args) {
  const query = String((args && args.query) || "").trim();
  const kind = (args && args.kind) || "tracks";
  const offset = Number((args && args.offset) || 0);
  if (kind !== "tracks" && kind !== "track") return { tracks: [], more: false };
  if (!query) return { tracks: [], more: false };
  const pageNo = 1 + Math.floor(offset / 20);
  const data = await json("/search", { method: "POST", body: { keyword: query, page: pageNo }, referer: BASE + "/listening" });
  const items = (data.results || data.items || []).map(albumOf).filter((a) => a.id);
  remember(items);
  const tracks = items.map(albumTrack);
  if (tracks.length) {
    const c = stored("suggestCache", {});
    c[query] = { at: Date.now(), names: tracks.slice(0, 8).map((t) => t.name) };
    const keys = Object.keys(c).sort((x, y) => c[y].at - c[x].at).slice(0, 40);
    const pick = {};
    for (const k of keys) pick[k] = c[k];
    keep("suggestCache", pick);
  }
  return { tracks: tracks, more: !!data.has_more };
}

export function suggest(args) {
  const query = String((args && args.query) || "").trim();
  if (!query) return [];
  const c = stored("suggestCache", {});
  const hit = c[query];
  if (hit && Date.now() - hit.at < SUGGEST_TTL) return hit.names || [];
  const core = query.replace(/[《》\s]/g, "").toLowerCase();
  const pool = [];
  const liked = stored("likedTracks", {});
  for (const k of Object.keys(liked)) pool.push(liked[k]);
  for (const t of knownTracks.values()) pool.push(t);
  const seen = new Set();
  const names = [];
  for (const t of pool) {
    if (!t || !t.name || !/^[0-9]+$/.test(String(t.id))) continue;
    const n = t.name.replace(/\s/g, "").toLowerCase();
    if (n.indexOf(core) < 0 || seen.has(t.name)) continue;
    seen.add(t.name);
    names.push(t.name);
    if (names.length >= 6) break;
  }
  return names;
}

export function lyrics() { return { lrc: "" }; }

/* ---------------------------------------------------------------- library */

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
