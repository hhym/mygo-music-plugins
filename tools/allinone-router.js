/* ------------------------------------------------------------------ */
/* 聚合层：前缀编码、页面包装、并发池                                  */
/* ------------------------------------------------------------------ */

const t = (text) => host.t(text);

const BY_ID = {};
for (const item of SRC_LIST) BY_ID[item.id] = item;

const ICON = "https://cdn.jsdelivr.net/gh/hhym/mygo-music-plugins@main/assets/hulu.png";

const CAT_ORDER = ["音乐", "DJ音乐", "听书", "评书"];
const CATS = CAT_ORDER.map((name) => ({ name: name, list: SRC_LIST.filter((src) => src.cat === name) })).filter(
  (cat) => cat.list.length
);

// 首页只拉这几个代表源，别一进来就发几十个请求
const FEATURED = ["buguyy-music", "5nd-music", "33ve", "damifan-music"];

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function enc(srcId, local) {
  return String(srcId) + ":" + String(local === null || local === undefined ? "" : local);
}

function split(raw) {
  const text = String(raw === null || raw === undefined ? "" : raw);
  const at = text.indexOf(":");
  if (at <= 0) return { src: null, local: text };
  const head = text.slice(0, at);
  const src = BY_ID[head];
  if (!src) return { src: null, local: text };
  return { src: src, local: text.slice(at + 1) };
}

function wrapTrack(track, src) {
  if (!track || !track.id) return track;
  const copy = Object.assign({}, track);
  copy.id = enc(src.id, track.id);
  const album = Object.assign({}, track.album || {});
  album.name = track.album && track.album.name ? src.name + " · " + track.album.name : src.name;
  copy.album = album;
  return copy;
}

function wrapTracks(tracks, src) {
  return (tracks || []).map((track) => wrapTrack(track, src)).filter(Boolean);
}

function wrapLink(link, src) {
  const copy = Object.assign({}, link);
  if (copy.page) copy.page = enc(src.id, copy.page);
  return copy;
}

function wrapPage(page, src) {
  if (!page || typeof page !== "object") return page;
  const out = Object.assign({}, page);
  if (Array.isArray(page.tracks)) out.tracks = wrapTracks(page.tracks, src);
  if (Array.isArray(page.sections)) {
    out.sections = page.sections.map((section) => {
      const copy = Object.assign({}, section);
      if (Array.isArray(section.tracks)) copy.tracks = wrapTracks(section.tracks, src);
      if (Array.isArray(section.links)) copy.links = section.links.map((link) => wrapLink(link, src));
      if (section.morePage) copy.morePage = enc(src.id, section.morePage);
      return copy;
    });
  }
  if (page.album && page.album.id) out.album = Object.assign({}, page.album, { id: enc(src.id, page.album.id) });
  if (Array.isArray(page.albums)) {
    out.albums = page.albums.map((item) => Object.assign({}, item, { id: enc(src.id, item.id) }));
  }
  if (Array.isArray(page.artists)) {
    out.artists = page.artists.map((item) => Object.assign({}, item, { id: enc(src.id, item.id) }));
  }
  if (Array.isArray(page.playlists)) {
    out.playlists = page.playlists.map((item) => Object.assign({}, item, { id: enc(src.id, item.id) }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 并发池                                                             */
/* ------------------------------------------------------------------ */

function pool(items, limit, worker, ms) {
  const list = items.slice();
  const results = [];
  let cursor = 0;

  return new Promise((resolve) => {
    let running = 0;
    let done = 0;
    const total = list.length;
    if (!total) return resolve([]);

    function finish() {
      done += 1;
      if (done >= total) resolve(results);
    }

    function next() {
      if (cursor >= total) return;
      const index = cursor;
      const item = list[cursor];
      cursor += 1;
      running += 1;

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        running -= 1;
        finish();
        next();
      }, ms || 8000);

      Promise.resolve()
        .then(() => worker(item, index))
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          results[index] = value;
          running -= 1;
          finish();
          next();
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          running -= 1;
          finish();
          next();
        });
    }

    for (let i = 0; i < Math.min(limit, total); i++) next();
  });
}

/* ------------------------------------------------------------------ */
/* 首页                                                               */
/* ------------------------------------------------------------------ */

function catPage(name) {
  const cat = CATS.filter((item) => item.name === name)[0];
  const list = cat ? cat.list : [];
  return {
    title: name,
    subtitle: list.length + " 个源",
    sections: [
      {
        title: "源列表",
        links: list.map((src) => ({ title: src.name, subtitle: src.description, page: "src:" + src.id, imageUrl: ICON })),
      },
    ],
  };
}

function catsPage() {
  return {
    title: "分类",
    subtitle: CATS.length + " 类，共 " + SRC_LIST.length + " 个源",
    sections: [
      {
        title: "分类",
        links: CATS.map((cat) => ({ title: cat.name, subtitle: cat.list.length + " 个源", page: "cat:" + cat.name, imageUrl: ICON })),
      },
    ],
  };
}

async function srcHome(id) {
  const src = BY_ID[id];
  if (!src || !src.mod.home) throw fail("unavailable", t("没有这个源"));
  const page = await src.mod.home();
  const out = wrapPage(page || {}, src);
  out.title = src.name;
  out.subtitle = src.description || (src.cat + " · " + src.version);
  return out;
}

async function homeOf(src) {
  if (!src || !src.mod.home) return null;
  try {
    const page = await src.mod.home();
    const tracks = [];
    for (const section of (page && page.sections) || []) {
      for (const track of section.tracks || []) {
        if (track && track.id) tracks.push(wrapTrack(track, src));
        if (tracks.length >= 8) break;
      }
      if (tracks.length >= 8) break;
    }
    if (!tracks.length) return null;
    return { title: src.name, tracks: tracks, morePage: enc(src.id, "home") };
  } catch (error) {
    console.log("[allinone] home of " + src.id + " failed:", error && error.message);
    return null;
  }
}

export async function home() {
  const featured = FEATURED.map((id) => BY_ID[id]).filter(Boolean);
  const got = await Promise.all(featured.map((src) => homeOf(src)));

  const sections = [
    {
      title: "分类",
      links: CATS.map((cat) => ({ title: cat.name, subtitle: cat.list.length + " 个源", page: "cat:" + cat.name, imageUrl: ICON })),
    },
  ];
  for (const section of got) if (section) sections.push(section);

  if (sections.length <= 1) {
    sections.push({
      title: "源列表",
      links: SRC_LIST.slice(0, 12).map((src) => ({ title: src.name, subtitle: src.description, page: "src:" + src.id, imageUrl: ICON })),
    });
  }

  return {
    title: "MyGo 聚合音源",
    subtitle: SRC_LIST.length + " 个源合在一起",
    sections: sections,
  };
}

/* ------------------------------------------------------------------ */
/* 浏览                                                               */
/* ------------------------------------------------------------------ */

export async function browse({ page }) {
  const raw = String(page === null || page === undefined ? "" : page);

  if (!raw || raw === "cats") return catsPage();
  if (raw.indexOf("cat:") === 0) return catPage(raw.slice(4));
  if (raw.indexOf("src:") === 0) return srcHome(raw.slice(4));

  const key = split(raw);
  if (!key.src) throw fail("unavailable", t("没有这个页面"));

  const src = key.src;
  const local = key.local;

  if (!local || local === "home") return srcHome(src.id);
  if (!src.mod.browse) throw fail("unavailable", t("这个源没有这个页面"));

  const got = await src.mod.browse({ page: local });
  const out = wrapPage(got || {}, src);
  if (!out.title) out.title = src.name;
  return out;
}

/* ------------------------------------------------------------------ */
/* 专辑与歌手                                                         */
/* ------------------------------------------------------------------ */

export async function album({ id }) {
  const key = split(id);
  if (!key.src || !key.src.mod.album) throw fail("unavailable", t("这个源没有专辑页"));
  return wrapPage(await key.src.mod.album({ id: key.local }), key.src);
}

export async function artist({ id }) {
  const key = split(id);
  if (!key.src || !key.src.mod.artist) throw fail("unavailable", t("这个源没有歌手页"));
  return wrapPage(await key.src.mod.artist({ id: key.local }), key.src);
}

export async function playlist({ id }) {
  const key = split(id);
  if (!key.src || !key.src.mod.playlist) throw fail("unavailable", t("这个源没有歌单页"));
  return wrapPage(await key.src.mod.playlist({ id: key.local }), key.src);
}

/* ------------------------------------------------------------------ */
/* 搜索                                                               */
/* ------------------------------------------------------------------ */

const SEARCH_LIMIT = 60;

export async function search({ query, kind, offset }) {
  const text = String(query || "").trim();
  const type = kind || "tracks";
  const start = Math.max(0, Number(offset || 0) || 0);

  if (!text) {
    if (type === "albums") return { albums: [], more: false };
    if (type === "artists") return { artists: [], more: false };
    return { tracks: [], more: false };
  }
  if (type !== "tracks" && type !== "albums" && type !== "artists") return { tracks: [], more: false };

  // tracks 全源并发；专辑与歌手只打前 8 个源，够用且不至于太慢
  const targets = type === "tracks" ? SRC_LIST : SRC_LIST.slice(0, 8);
  const limit = type === "tracks" ? 10 : 6;

  const hits = await pool(
    targets,
    limit,
    async (src) => {
      if (!src.mod.search) return null;
      const result = await src.mod.search({ query: text, kind: type });
      return { src: src, result: result };
    },
    7000
  );

  if (type === "albums") {
    const albums = [];
    for (const hit of hits) {
      if (!hit || !hit.result) continue;
      for (const item of hit.result.albums || []) {
        if (!item || !item.id) continue;
        albums.push(Object.assign({}, item, { id: enc(hit.src.id, item.id), description: hit.src.name }));
      }
    }
    return { albums: albums.slice(start, start + 30), more: albums.length > start + 30 };
  }

  if (type === "artists") {
    const artists = [];
    for (const hit of hits) {
      if (!hit || !hit.result) continue;
      for (const item of hit.result.artists || []) {
        if (!item || !item.id) continue;
        artists.push(Object.assign({}, item, { id: enc(hit.src.id, item.id) }));
      }
    }
    return { artists: artists.slice(start, start + 30), more: artists.length > start + 30 };
  }

  const tracks = [];
  for (const hit of hits) {
    if (!hit || !hit.result) continue;
    for (const track of hit.result.tracks || []) {
      if (!track || !track.id) continue;
      tracks.push(wrapTrack(track, hit.src));
    }
  }

  const page = tracks.slice(start, start + SEARCH_LIMIT);
  return { tracks: page, more: tracks.length > start + SEARCH_LIMIT };
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];

  const picks = FEATURED.map((id) => BY_ID[id]).filter((src) => src && src.mod.suggest);
  const hits = await pool(
    picks,
    3,
    async (src) => {
      const out = await src.mod.suggest({ query: text });
      return (out || []).map((line) => src.name.replace(/音乐$/, "") + "：" + line);
    },
    6000
  );

  const merged = [];
  for (const list of hits) for (const line of list || []) if (merged.indexOf(line) < 0) merged.push(line);
  return merged.slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* 取流与歌词                                                         */
/* ------------------------------------------------------------------ */

/* 源没给 size 时，聚合层补一次 Range 探测，让每个源的进度条都有总时长。
   HLS（.m3u8）没有整体字节数，跳过。 */
const sizeCache = new Map();

async function sizeOf(url) {
  const target = String(url || "");
  if (!target || /\.m3u8(\?|$)/i.test(target)) return 0;

  const cached = sizeCache.get(target);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.size;

  let size = 0;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  try {
    const init = { headers: { range: "bytes=0-1" } };
    if (controller) init.signal = controller.signal;
    const request = fetch(target, init);
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail("timeout", "size probe timed out")), 6000);
      request.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
    const range = response.headers.get("content-range") || "";
    const total = Number((range.match(/\/\s*(\d+)/) || [])[1]);
    const length = Number(response.headers.get("content-length")) || 0;
    size = total > 0 ? total : response.status === 200 ? length : 0;
    if (response.body && typeof response.body.cancel === "function") {
      try {
        response.body.cancel();
      } catch (error) {
        // 忽略
      }
    }
  } catch (error) {
    if (controller) controller.abort();
    size = 0;
  }

  sizeCache.set(target, { at: Date.now(), size: size });
  if (sizeCache.size > 200) sizeCache.delete(sizeCache.keys().next().value);
  return size;
}

export async function stream({ id }) {
  const key = split(id);
  if (!key.src || !key.src.mod.stream) throw fail("unavailable", t("这首歌暂时取不到播放地址"));
  const out = await key.src.mod.stream({ id: key.local });
  if (out && !out.size && out.url) {
    const size = await sizeOf(out.url);
    if (size > 0) out.size = size;
  }
  return out;
}

export async function lyrics({ id }) {
  const key = split(id);
  if (!key.src || !key.src.mod.lyrics) return { lrc: "" };
  try {
    return await key.src.mod.lyrics({ id: key.local });
  } catch (error) {
    return { lrc: "" };
  }
}

/* ------------------------------------------------------------------ */
/* 本地库：收藏与最近播放，聚合层自己管一份                           */
/* ------------------------------------------------------------------ */

const LIB_LIKED = "lib.liked";
const LIB_RECENT = "lib.recent";
const LIB_INDEX = "lib.tracks";
const LIB_LIKED_TRACKS = "lib.likedTracks";

const index = host.storage.get(LIB_INDEX) || {};

function load(key, fallback) {
  const value = host.storage.get(key);
  return value === null || value === undefined ? fallback : value;
}

function save(key, value) {
  host.storage.set(key, value);
}

function remember(tracks) {
  let added = false;
  for (const track of tracks || []) {
    if (track && track.id && !index[track.id]) {
      index[track.id] = track;
      added = true;
    }
  }
  if (!added) return;
  const keys = Object.keys(index);
  if (keys.length > 4000) {
    for (const key of keys.slice(0, keys.length - 4000)) delete index[key];
  }
  host.storage.set(LIB_INDEX, index);
}

function trackById(id) {
  if (index[id]) return index[id];
  const saved = load(LIB_LIKED_TRACKS, {});
  return saved[id] || { id: String(id), name: String(id), album: { name: "" } };
}

export function played({ id }) {
  if (!id) return;
  const ids = load(LIB_RECENT, []).filter((item) => item !== id);
  ids.unshift(String(id));
  save(LIB_RECENT, ids.slice(0, 30));
}

export function recent() {
  return load(LIB_RECENT, [])
    .map(trackById)
    .filter(Boolean)
    .slice(0, 12);
}

export function liked() {
  const ids = load(LIB_LIKED, []);
  const tracks = ids.map(trackById).filter(Boolean);
  remember(tracks);
  return { tracks: tracks, more: false };
}

export function isLiked({ ids }) {
  const set = new Set(load(LIB_LIKED, []));
  const out = {};
  for (const id of ids || []) out[id] = set.has(String(id));
  return out;
}

export function like({ id, on }) {
  const set = new Set(load(LIB_LIKED, []));
  if (on) {
    set.add(String(id));
    if (index[id]) {
      const saved = load(LIB_LIKED_TRACKS, {});
      saved[id] = index[id];
      save(LIB_LIKED_TRACKS, saved);
    }
  } else {
    set.delete(String(id));
  }
  save(LIB_LIKED, [...set]);
}
