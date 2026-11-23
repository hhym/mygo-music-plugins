// 显示名：36DJ舞曲（36dj-music）
// MyGo Music plugin — 36DJ舞曲 (www.36dj.com)
//
// An old-style DJ site on EmpireCMS: list pages are plain HTML tables of links,
// and the detail page carries the audio path in a JS object.
//
//   GET  /                        newest uploads (mulist rows)
//   GET  /html/new/                newest, index_2.html ... index_12.html
//   GET  /html/good/               recommended
//   GET  /top/                     chart
//   GET  /xc/                      remix (411 pages), /myxc/ slow remix,
//        /zw/ Chinese, /my/ slow, /yw/ English
//   GET  /play/<id>.html          var info = { playurl: "2026/3611/...m4a" }
//   POST /e/search/index.php      classid=1, show=title, tempid=1, keyboard
//   GET  /e/search/result/index.php?page=N&searchid=<id>
//   GET  /js/lb/a.js              var vsid = '...'; var vsidExpire = <unix>
//
// The audio lives on https://tn2.72djapp.cn/36djwma7/<playurl> and refuses
// every request unless it carries ?vsid=<the token from a.js>, which expires
// roughly every ten minutes. stream() therefore asks a.js again on each
// play and verifies the result with a one-byte Range request before handing
// the URL over. With a valid vsid the CDN answers 206 with audio/mp4, so the
// App can seek; without one it answers 403 with an empty body.

const BASE = "https://www.36dj.com";
const AUDIO = "https://tn2.72djapp.cn/36djwma7/";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const PER_PAGE = 25;
const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function getHtml(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const method = options.method || "GET";
  const headers = Object.assign({}, HEAD, options.headers || {});
  let body = options.body;
  if (body != null && !headers["content-type"]) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }

  const ms = options.timeout || 15000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) options.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);

  try {
    const res = await fetch(url, { method, headers, body, signal: controller ? controller.signal : undefined });
    if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const pageCache = new Map();

async function page(path, ttl) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  const life = (ttl == null ? 5 : ttl) * 60 * 1000;
  if (cached && Date.now() - cached.at < life) return cached.html;
  const html = await getHtml(path);
  pageCache.set(url, { at: Date.now(), html: html });
  return html;
}

/* ---------------------------------------------------------------- parsing */

function decode(text) {
  return String(text == null ? "" : text).replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|hellip|middot);/gi,
    (match, entity) => {
      const name = entity.toLowerCase();
      if (name === "amp") return "&";
      if (name === "lt") return "<";
      if (name === "gt") return ">";
      if (name === "quot") return '"';
      if (name === "apos") return "'";
      if (name === "nbsp") return " ";
      if (name === "hellip") return "…";
      if (name === "middot") return "·";
      if (name.charAt(0) === "#") {
        const code = name.charAt(1) === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return isNaN(code) ? match : String.fromCharCode(code);
      }
      return match;
    },
  );
}

function plain(html) {
  return decode(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function maxPageOf(html) {
  let max = 1;
  const text = String(html || "");
  /* category pages page by file name (index_2.html); the search result
     pager pages by query (?page=2&searchid=...). Take the larger of the two. */
  for (const item of text.match(/index_(\d+)\.html/g) || []) {
    const n = parseInt(item.slice(6), 10);
    if (n > max) max = n;
  }
  for (const item of text.match(/page=(\d+)/g) || []) {
    const n = parseInt(item.slice(5), 10);
    if (n > max) max = n;
  }
  return max;
}

function siteTitle(html, fallback) {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return fallback;
  return decode(match[1])
    .replace(/\s*[-_|]\s*36DJ舞曲网.*$/i, "")
    .replace(/\s*[-_|]\s*36DJ舞曲.*$/i, "")
    .replace(/[\s_-]+$/g, "")
    .trim() || fallback;
}

function nameOfTrack(label) {
  let name = decode(label || "").replace(/\s+/g, " ").trim();
  name = name.replace(/^[·\-–—|]\s*/, "").trim();
  return name || t("舞曲");
}

/* List pages come in two shapes: category pages repeat the checkbox row
   (input carrying the id, a title link, then 人气 / 上传时间 in <em>), while
   the search results and the chart keep a bare title link. In every shape
   each track also has small action anchors — 试听 / 收藏 / 下载 — which must
   not be mistaken for the name, so links are read in order and only the first
   one that carries a real title counts. */
const ACTIONS = /^(试听|收藏|下载|播放)$/;

function parseRows(html) {
  const tracks = [];
  const seen = new Set();
  const text = String(html || "");
  const re = /<a href="\/play\/(\d+)\.html"([^>]*)>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = re.exec(text))) {
    const id = match[1];
    if (seen.has(id)) continue;

    const attrs = match[2] || "";
    const title = (/title="([^"]*)"/.exec(attrs) || [])[1] || "";
    const word = (plain(match[3]) || decode(title)).trim();
    if (!word) continue;
    if (ACTIONS.test(word)) continue;

    seen.add(id);
    tracks.push(trackOf(id, nameOfTrack(word)));
  }
  return tracks;
}

function trackOf(id, name) {
  return { id: String(id), name: name };
}

/* --------------------------------------------------------------- detail page */

function detailOf(html, id) {
  const musicName = /var music_name\s*=\s*"([^"]*)"/.exec(html);
  const play = /"playurl"\s*:\s*"([^"]+)"/.exec(html) || /playurl\s*:\s*'([^']+)'/.exec(html);
  const meta = /<meta name="Description" content="([^"]*)"/i.exec(html);
  return {
    id: String(id),
    name: musicName ? decode(musicName[1]).trim() : "",
    playurl: play ? decode(play[1]).trim() : "",
    intro: meta ? decode(meta[1]).trim() : "",
  };
}

/* -------------------------------------------------------------------- vsid */

let vsidCache = { value: "", expire: 0, issued: 0 };

async function vsid(force) {
  const now = Math.floor(Date.now() / 1000);
  if (!force && vsidCache.value && vsidCache.expire - now > 90) return vsidCache.value;

  const js = await getHtml("/js/lb/a.js", { timeout: 10000 });
  const token = /vsid\s*=\s*'([^']+)'/.exec(js) || /vsid\s*=\s*"([^"]+)"/.exec(js);
  const expire = /vsidExpire\s*=\s*(\d+)/.exec(js);
  if (!token) throw fail("unavailable", t("音频令牌没取到"));

  vsidCache = {
    value: token[1],
    expire: expire ? parseInt(expire[1], 10) : now + 600,
    issued: Date.now(),
  };
  return vsidCache.value;
}

async function audioFor(playurl) {
  if (!playurl) throw fail("unavailable", t("这首没有音频地址"));
  const clean = playurl.replace(/^\/+/, "");
  const fresh = vsidCache.value && Date.now() - vsidCache.issued < 90 * 1000;
  let token = await vsid(false);

  /* A token we minted moments ago is already proven; the Range probe costs a
     CDN round trip, so skip it while the token is still young. */
  if (fresh) return { url: AUDIO + clean + "?vsid=" + encodeURIComponent(token) };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = AUDIO + clean + "?vsid=" + encodeURIComponent(token);
    const res = await fetch(url, { headers: { "user-agent": UA, range: "bytes=0-1" }, method: "GET" });
    const range = res.headers.get("content-range");
    const size = range ? parseInt(range.split("/")[1], 10) : 0;
    if (res.status === 206 || res.status === 200) {
      try {
        await res.arrayBuffer();
      } catch (error) {
        /* the URL itself is fine even if the probe body fails */
      }
      return { url: url, size: size || undefined };
    }
    token = await vsid(true);
  }

  throw fail("unavailable", t("音频地址被拒绝，可能是令牌过期，稍后再试"));
}

/* ------------------------------------------------------------------- pages */

const CATEGORIES = {
  xc: "串烧舞曲",
  myxc: "慢摇串烧",
  zw: "中文舞曲",
  my: "慢摇舞曲",
  yw: "英文舞曲",
};

function splitPage(value) {
  const clean = String(value || "").replace(/^\/+|\/+$/g, "");
  const numbered = /^(.*?)\/(\d+)$/.exec(clean);
  if (numbered) return { base: numbered[1], page: parseInt(numbered[2], 10) || 1 };
  return { base: clean, page: 1 };
}

function listPath(base, pageNo) {
  const suffix = pageNo > 1 ? "index_" + pageNo + ".html" : "";
  if (base === "latest") return "/html/new/" + suffix;
  if (base === "new") return "/html/new/" + suffix;
  if (base === "good") return "/html/good/" + suffix;
  if (base === "rank") return "/top/" + suffix;
  const category = /^category\/([a-z]+)$/.exec(base);
  if (category && CATEGORIES[category[1]]) return "/" + category[1] + "/" + suffix;
  return "";
}

export async function home() {
  const sections = [];

  const front = await page("/");
  const latest = parseRows(front).slice(0, 20);
  if (latest.length) {
    remember(latest);
    sections.push({ title: t("最新上传"), tracks: latest, morePage: "latest" });
  }

  try {
    const chart = await page("/top/");
    const rank = parseRows(chart).slice(0, 10);
    if (rank.length) {
      remember(rank);
      sections.push({ title: t("DJ舞曲榜"), tracks: rank, morePage: "rank" });
    }
  } catch (error) {
    /* the chart row must not empty Home */
  }

  sections.push({
    title: t("分类"),
    links: [
      { title: t("串烧舞曲"), page: "category/xc" },
      { title: t("慢摇串烧"), page: "category/myxc" },
      { title: t("中文舞曲"), page: "category/zw" },
      { title: t("慢摇舞曲"), page: "category/my" },
      { title: t("英文舞曲"), page: "category/yw" },
      { title: t("推荐舞曲"), page: "good" },
      { title: t("最新上传"), page: "latest" },
    ],
  });

  return {
    title: t("36DJ舞曲"),
    subtitle: t("DJ舞曲 · 串烧 · 车载大碟"),
    sections: sections,
  };
}

export async function browse({ page: pageId }) {
  const split = splitPage(pageId);
  const pageNo = split.page || 1;

  const list = listPath(split.base, pageNo);
  if (list) {
    const html = await page(list);
    const tracks = parseRows(html);
    if (!tracks.length) throw fail("unavailable", t("这一页没有舞曲"));
    remember(tracks);

    const category = /^category\/([a-z]+)$/.exec(split.base);
    const title =
      category
        ? t(CATEGORIES[category[1]])
        : split.base === "good"
          ? t("推荐舞曲")
          : split.base === "rank"
            ? t("DJ舞曲榜")
            : split.base === "latest" || split.base === "new"
              ? t("最新上传")
              : siteTitle(html, t("舞曲"));

    const max = maxPageOf(html);
    return {
      title: title,
      sections: [
        {
          title: title,
          tracks: tracks,
          morePage: pageNo < max ? split.base + "/" + (pageNo + 1) : undefined,
        },
      ],
    };
  }

  const track = /^track\/(\d+)$/.exec(split.base);
  if (track) {
    const one = await album({ id: track[1] });
    return {
      title: one.album.name,
      description: one.album.description,
      sections: [{ title: t("舞曲"), tracks: one.tracks }],
    };
  }

  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------- search */

function searchState() {
  const value = host.storage.get("searchState");
  return value || null;
}

/* The site's own search is EmpireCMS: a POST lands on a result page that
   remembers the query by searchid, and paging reads that id back. */
async function searchFirst(keyword) {
  const body = "classid=1&show=title&tempid=1&submit=&keyboard=" + encodeURIComponent(keyword);
  const html = await getHtml("/e/search/index.php", { method: "POST", body: body, timeout: 18000 });
  const sid = /searchid=(\d+)/.exec(html);
  if (sid) {
    host.storage.set("searchState", { keyword: keyword, id: sid[1], at: Date.now() });
  }
  return { html: html, id: sid ? sid[1] : "" };
}

async function searchPage(keyword, pageNo) {
  if (pageNo <= 1) return (await searchFirst(keyword)).html;
  let state = searchState();
  if (!state || state.keyword !== keyword || !state.id) {
    state = { keyword: keyword, id: (await searchFirst(keyword)).id, at: Date.now() };
  }
  if (!state.id) return (await searchFirst(keyword)).html;
  try {
    return await page(
      "/e/search/result/index.php?page=" + pageNo + "&searchid=" + state.id,
      2,
    );
  } catch (error) {
    const again = await searchFirst(keyword);
    if (!again.id) return again.html;
    return page("/e/search/result/index.php?page=" + pageNo + "&searchid=" + again.id, 2);
  }
}

export async function search({ query, offset, kind }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));
  if (kind && kind !== "tracks") return { albums: [], more: false };

  const start = Math.max(0, Number(offset) || 0);
  const pageNo = Math.floor(start / PER_PAGE) + 1;
  const skip = start % PER_PAGE;

  const html = await searchPage(keyword, pageNo);
  if (!html || /没有搜索到|没有找到/.test(html)) return { tracks: [], more: false };

  const tracks = parseRows(html).slice(skip, skip + PER_PAGE);
  if (!tracks.length) return { tracks: [], more: false };
  remember(tracks);

  const max = maxPageOf(html);
  return { tracks: tracks, more: pageNo < max };
}

export function suggest({ query }) {
  const words = String(query || "").trim();
  const hot = [t("车载"), t("串烧"), t("慢摇"), t("中文"), t("英文"), t("电音"), t("抖音"), t("情歌")];
  if (!words) return hot.slice(0, 6);
  return hot.filter((item) => item.indexOf(words) >= 0 || words.indexOf(item) >= 0).slice(0, 6);
}

/* -------------------------------------------------------------- album/artist */

export async function album({ id }) {
  const key = String(id || "").replace(/^t:/, "");
  if (!/^\d+$/.test(key)) throw fail("invalid", t("没有这首舞曲"));

  const html = await page("/play/" + key + ".html");
  const info = detailOf(html, key);
  if (!info.name) throw fail("unavailable", t("这首舞曲不存在"));

  const track = trackOf(key, info.name);
  remember([track]);

  return {
    album: {
      id: "t:" + key,
      name: info.name,
      description: info.intro || undefined,
    },
    tracks: [track],
  };
}

/* The site has no artist field; names carry the uploader like "DJ小启", so
   artist() answers with a search on the name instead. */
export async function artist({ id }) {
  const raw = String(id || "");
  let name = raw.indexOf("a:") === 0 ? raw.slice(2) : raw;
  try {
    name = decodeURIComponent(name);
  } catch (error) {
    /* keep the raw name */
  }
  name = name.trim() || t("舞曲");

  let tracks = [];
  try {
    const html = await searchPage(name, 1);
    tracks = parseRows(html).slice(0, PER_PAGE);
    remember(tracks);
  } catch (error) {
    tracks = [];
  }

  return {
    artist: { id: "a:" + encodeURIComponent(name), name: name },
    tracks: tracks,
  };
}

/* ------------------------------------------------------------------- playing */

export async function stream({ id }) {
  const key = String(id || "").replace(/^t:/, "");
  if (!/^\d+$/.test(key)) throw fail("invalid", t("没有这首舞曲"));

  const html = await page("/play/" + key + ".html", 10);
  const info = detailOf(html, key);
  const audio = await audioFor(info.playurl);
  return { url: audio.url, type: "m4a", size: audio.size };
}

export function lyrics() {
  return { lrc: "" };
}

/* ------------------------------------------------------------- local library */

const trackIndex = host.storage.get("trackIndex") || {};

function remember(tracks) {
  let changed = false;
  for (const track of tracks) {
    if (!track || !track.id) continue;
    const entry = { id: track.id, name: track.name };
    const old = trackIndex[track.id];
    if (!old || old.name !== entry.name) {
      trackIndex[track.id] = entry;
      changed = true;
    }
  }
  if (changed) host.storage.set("trackIndex", trackIndex);
}

function load(key, fallback) {
  const value = host.storage.get(key);
  return value == null ? fallback : value;
}

function trackById(id) {
  if (trackIndex[id]) return trackIndex[id];
  const liked = load("likedTracks", {});
  return liked[id] || { id: id, name: t("舞曲") };
}

export function played({ id }) {
  if (!id) return;
  const ids = load("recent", []).filter((item) => item !== id);
  ids.unshift(id);
  host.storage.set("recent", ids.slice(0, 20));
}

export function recent() {
  return load("recent", []).map(trackById).filter(Boolean).slice(0, 10);
}

export function like({ id, on }) {
  const ids = load("liked", []).filter((item) => item !== id);
  if (on) ids.unshift(id);
  host.storage.set("liked", ids);

  const set = load("likedSet", {});
  if (on) set[id] = true;
  else delete set[id];
  host.storage.set("likedSet", set);

  const tracks = load("likedTracks", {});
  if (on) tracks[id] = trackById(id);
  else delete tracks[id];
  host.storage.set("likedTracks", tracks);
}

export function liked() {
  const ids = load("liked", []);
  return { tracks: ids.map(trackById), more: false };
}

export function isLiked({ ids }) {
  const set = load("likedSet", {});
  const answer = {};
  for (const id of ids || []) answer[id] = !!set[id];
  return answer;
}
