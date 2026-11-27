// 显示名：清风DJ音乐网（vvdj-music）
// MyGo Music plugin — 清风DJ音乐网 (www.vvdj.com)
//
// 站点是 PHP + 静态化 HTML，列表和播放页都能直接 fetch：
//
//   GET /                              首页推荐（div.rec-item）
//   GET /sort/c1/                      串烧舞曲；分页 /sort/c1/2-0-0-0-1.html
//   GET /sort/c2/ /sort/c3/ /sort/c4/  慢歌连版 / 华语Remix / 外语Remix
//   GET /so/<kw>.html?page=<n>         搜索，40 条一页
//   GET /hot/<slug>/                   热门主题；分页 /hot/<slug>/s0-<n>.html
//   GET /top/mixes                     Top 100 榜单
//   GET /radio/ /radio/<id>.html       DJ 歌单（40 首）
//   GET /djshow/<id>.html              制作人主页
//   GET /play/<id>.html                播放页，audio#vvdj-audio
//
// 音频是 media.vvdj.com 上带 sign/t 的 m4a，地址会过期，所以 stream()
// 每次重新抓播放页，不能把 URL 长期缓存。实测 Range 回 206，可拖动。

const BASE = "https://www.vvdj.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const PAGE_SIZE = 20;
const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function request(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const headers = Object.assign({}, HEAD, options.headers || {});
  const init = { method: options.method || "GET", headers: headers };
  const ms = options.timeout || 18000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    const res = await fetch(url, init);
    if (res.status === 404) throw fail("not-found", t("站点没有这个页面"));
    if (res.status === 403) throw fail("blocked", t("站点拒绝了请求，请稍后再试"));
    if (res.status >= 500) throw fail("unavailable", t("站点暂时不可用（HTTP " + res.status + "）"));
    if (!res.ok) throw fail("unavailable", t("站点返回异常（HTTP " + res.status + "）"));
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const pageCache = new Map();

async function html(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.html;
  const res = await request(url, options);
  const text = await res.text();
  pageCache.set(url, { at: Date.now(), html: text });
  return text;
}

/* ------------------------------------------------------------------- parsing */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(value) {
  return String(value == null ? "" : value).replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, name) => {
    const key = String(name).toLowerCase();
    if (key[0] === "#") {
      const code = key[1] === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return Number.isFinite(code) ? String.fromCharCode(code) : whole;
    }
    return ENTITIES[key] || whole;
  });
}

function textOf(value) {
  return decode(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function imageUrl(value) {
  const raw = decode(value || "").trim();
  if (!raw) return undefined;
  if (raw.indexOf("//") === 0) return "https:" + raw;
  if (raw.indexOf("http") === 0) return raw;
  if (raw.indexOf("/") === 0) return BASE + raw;
  return raw;
}

function parseDuration(text) {
  const source = String(text || "");
  let match = /TIME\s*(\d{1,2}):(\d{2}):(\d{2})/i.exec(source);
  if (match) {
    return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
  }
  match = /TIME\s*(\d{1,3}):(\d{2})/i.exec(source);
  if (match) return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  match = /(\d{1,3})\s*分\s*(\d{1,2})\s*秒/.exec(source);
  if (match) return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  return undefined;
}

function parseSize(text) {
  const match = /SIZE\s*([\d.]+)\s*(KB|MB|GB)/i.exec(String(text || ""));
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  if (!Number.isFinite(value)) return undefined;
  return Math.round(value * (unit === "GB" ? 1073741824 : unit === "MB" ? 1048576 : 1024));
}

function artistsOf(name) {
  const clean = String(name || "").replace(/^\s*【[^】]*】\s*/, "").trim();
  const match = /^(.{1,28}?)\s*[-–—]\s*(.+)$/.exec(clean);
  if (!match) return [];
  const singer = match[1].trim();
  if (!singer) return [];
  return [{ name: singer }];
}

function trackOf(id, name, extra = {}) {
  return Object.assign(
    {
      id: String(id),
      name: name,
      artists: artistsOf(name),
    },
    extra
  );
}

/* List rows look like:
   <li data-mid="232529">
     ... <a class="cover-ph"><img src="//img.vvdj.com/..."></a>
     <a class="m-name" title="灵山Dj十三-...">...</a>
     <p class="m-meta">TIME 57:37　SIZE 132.1MB　320 KBPS</p>
     ...
     <span class="m-date music-date">2026/11/26</span>
   </li>
*/
function parseList(source) {
  const rows = [];
  const seen = new Set();
  const re = /<li[^>]*\bdata-mid=["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/g;
  let match;
  while ((match = re.exec(String(source || "")))) {
    const id = match[1];
    if (seen.has(id)) continue;
    const chunk = match[2];
    const name =
      decode((/<a[^>]+class=["'][^"']*\bm-name\b[^"']*["'][^>]*title=["']([^"']*)["']/i.exec(chunk) || [])[1] || "") ||
      textOf((/<a[^>]+class=["'][^"']*\bm-name\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(chunk) || [])[1] || "");
    if (!name) continue;
    const cover = imageUrl((/<img[^>]+src=["']([^"']+)["']/i.exec(chunk) || [])[1]);
    const meta = textOf((/<p[^>]+class=["'][^"']*\bm-meta\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(chunk) || [])[1] || "");
    let category = "";
    const beforeTime = meta.split(/\s*TIME\s*/i)[0] || "";
    const no = /NO\.\d+\s*([^\s　]+)/i.exec(beforeTime);
    if (no) category = no[1].trim();
    const date = textOf((/<span[^>]+class=["'][^"']*\bm-date\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(chunk) || [])[1] || "");
    const extra = {
      imageUrl: cover,
      duration: parseDuration(meta),
      album: category ? { name: category } : undefined,
    };
    if (date) extra.description = date;
    rows.push(trackOf(id, name, extra));
    seen.add(id);
  }
  return rows;
}

/* Home recommendation cards:
   <div class="rec-item" data-mid="232529">
     <a class="rec-name" title="...">...</a>
     <img src="//img.vvdj.com/...">
     <span class="rec-tag">串烧舞曲</span>
   </div>
*/
function parseRecommended(source) {
  const chunks = String(source || "").split(/<div[^>]+class=["'][^"']*\brec-item\b/i).slice(1);
  const tracks = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const head = chunk.slice(0, 2200);
    const id = (/\bdata-mid=["'](\d+)["']/i.exec(head) || [])[1];
    if (!id || seen.has(id)) continue;
    const name =
      decode((/class=["'][^"']*\brec-name\b[^"']*["'][^>]*title=["']([^"']*)["']/i.exec(head) || [])[1] || "") ||
      textOf((/class=["'][^"']*\brec-name\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(head) || [])[1] || "");
    if (!name) continue;
    const cover = imageUrl((/<img[^>]+src=["']([^"']+)["']/i.exec(head) || [])[1]);
    const category = textOf((/class=["'][^"']*\brec-tag\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(head) || [])[1] || "");
    tracks.push(
      trackOf(id, name, {
        imageUrl: cover,
        album: category ? { name: category } : undefined,
      })
    );
    seen.add(id);
  }
  return tracks;
}

function parseRadioCards(source) {
  const chunks = String(source || "").split(/<div[^>]+class=["'][^"']*\bgd-item\b/i).slice(1);
  const albums = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const id = (/\/radio\/(\d+)\.html/i.exec(chunk) || [])[1];
    if (!id || seen.has(id)) continue;
    const name =
      decode((/title=["']([^"']+)["']/i.exec(chunk) || [])[1] || "") ||
      textOf((/<a[^>]+class=["'][^"']*truncate[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(chunk) || [])[1] || "");
    if (!name) continue;
    const cover = imageUrl((/<img[^>]+src=["']([^"']+)["']/i.exec(chunk) || [])[1]);
    albums.push({ id, name, imageUrl: cover });
    seen.add(id);
  }
  return albums;
}

function parseHotCards(source) {
  const chunks = String(source || "").split(/<div[^>]+class=["'][^"']*\bgd-item\b/i).slice(1);
  const items = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const slug = (/\/hot\/([a-z0-9]+)\//i.exec(chunk) || [])[1];
    if (!slug || seen.has(slug)) continue;
    const name = decode((/title=["']([^"']+)["']/i.exec(chunk) || [])[1] || "");
    const cover = imageUrl((/<img[^>]+src=["']([^"']+)["']/i.exec(chunk) || [])[1]);
    items.push({ id: slug, name: name || slug, imageUrl: cover });
    seen.add(slug);
  }
  return items;
}

function parsePlay(source) {
  const page = String(source || "");
  const name =
    textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(page) || [])[1] || "") ||
    textOf((/<title>([\s\S]*?)<\/title>/i.exec(page) || [])[1] || "").split(" - ")[0];
  const audio = decode(
    (
      /<audio[^>]+id=["']vvdj-audio["'][^>]*src=["']([^"']+)["']/i.exec(page) ||
      /<audio[^>]+src=["']([^"']+)["'][^>]*id=["']vvdj-audio["']/i.exec(page) ||
      []
    )[1] || ""
  );
  const cover = imageUrl(
    (/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(page) ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(page) ||
      [])[1]
  );
  const body = textOf(page);
  const sizeText = (/大小[:：]\s*([\d.]+\s*(?:MB|GB|KB))/i.exec(body) || [])[1];
  const category = (/分类[:：]\s*([^\s]+)/.exec(body) || [])[1];
  return { name, audio, cover, sizeText, category };
}

/* ------------------------------------------------------------------ browsing */

const SORTS = {
  c1: t("串烧舞曲"),
  c2: t("慢歌连版"),
  c3: t("华语Remix"),
  c4: t("外语Remix"),
};

const HOT = ["串烧", "慢摇", "车载", "抖音", "Electro", "House", "Remix", "粤语"];

function sortPath(sort, pageNo) {
  const page = Math.max(1, Number(pageNo) || 1);
  return page > 1 ? "/sort/" + sort + "/" + page + "-0-0-0-1.html" : "/sort/" + sort + "/";
}

export async function home() {
  const sections = [];
  const front = await html("/");
  const recommended = parseRecommended(front).slice(0, 20);
  if (recommended.length) {
    remember(recommended);
    sections.push({ title: t("推荐舞曲"), tracks: recommended, morePage: "sort/c1/2" });
  }

  const wanted = [
    ["sort/c3", t("最新华语")],
    ["sort/c2", t("最新慢歌")],
    ["sort/c4", t("最新外语")],
  ];
  const results = await Promise.allSettled(wanted.map((item) => html(sortPath(item[0].split("/")[1], 1))));
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const tracks = parseList(result.value).slice(0, 16);
    if (!tracks.length) return;
    remember(tracks);
    sections.push({ title: wanted[index][1], tracks: tracks, morePage: wanted[index][0] + "/2" });
  });

  try {
    const radioPage = await html("/radio/");
    const albums = parseRadioCards(radioPage).slice(0, 10);
    if (albums.length) sections.push({ title: t("DJ歌单"), albums: albums, morePage: "radio" });
  } catch (error) {
    /* 歌单是附加板块，失败不影响首页 */
  }

  sections.push({
    title: t("分类与榜单"),
    links: [
      { title: t("串烧舞曲"), page: "sort/c1" },
      { title: t("慢歌连版"), page: "sort/c2" },
      { title: t("华语Remix"), page: "sort/c3" },
      { title: t("外语Remix"), page: "sort/c4" },
      { title: t("热门榜单"), page: "top/mixes" },
      { title: t("热门主题"), page: "hot" },
      { title: t("DJ歌单"), page: "radio" },
      { title: t("制作人"), page: "artists" },
    ],
  });

  return {
    title: t("清风DJ音乐网"),
    subtitle: t("好音质更动人 · DJ舞曲、串烧与车载"),
    sections: sections,
  };
}

export async function browse({ page }) {
  const path = String(page || "").trim();
  const parts = path.split("/").filter(Boolean);
  const head = parts[0] || "";
  const pageNo = Number(parts[parts.length - 1]) || 1;

  if (head === "" || head === "latest") {
    const data = await html(sortPath("c3", pageNo));
    const tracks = parseList(data);
    remember(tracks);
    return {
      title: t("最新舞曲"),
      sections: [{ title: t("最新舞曲"), tracks: tracks, morePage: "latest/" + (pageNo + 1) }],
    };
  }

  if (head === "sort" && SORTS[parts[1]]) {
    const sort = parts[1];
    const data = await html(sortPath(sort, pageNo));
    const tracks = parseList(data);
    remember(tracks);
    const title = SORTS[sort];
    return {
      title: title,
      description: t("第 {page} 页").replace("{page}", String(pageNo)),
      sections: [
        {
          title: title,
          tracks: tracks,
          morePage: hasNext(data, pageNo) ? "sort/" + sort + "/" + (pageNo + 1) : undefined,
        },
      ],
    };
  }

  if (head === "top") {
    const slug = parts[1] || "mixes";
    const data = await html("/top/" + slug);
    const tracks = parseList(data);
    remember(tracks);
    const title = textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(data) || [])[1] || "") || t("热门榜单");
    return { title: title, sections: [{ title: title, tracks: tracks }] };
  }

  if (head === "hot") {
    if (parts.length === 1) {
      const data = await html("/hot/");
      const topics = parseHotCards(data);
      return {
        title: t("热门主题"),
        sections: [{ title: t("热门主题"), links: topics.map((item) => ({ title: item.name, page: "hot/" + item.id })) }],
      };
    }
    const slug = parts[1];
    const topicPage = Number(parts[2]) || 1;
    const url =
      topicPage > 1 ? "/hot/" + slug + "/s0-" + topicPage + ".html" : "/hot/" + slug + "/";
    const data = await html(url);
    const tracks = parseList(data);
    remember(tracks);
    const title =
      textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(data) || [])[1] || "")
        .replace(/\s*\+\s*关注.*$/, "")
        .trim() || t("热门主题");
    return {
      title: title,
      sections: [
        { title: title, tracks: tracks, morePage: hasNext(data, topicPage) ? "hot/" + slug + "/" + (topicPage + 1) : undefined },
      ],
    };
  }

  if (head === "radio") {
    if (parts.length === 1) {
      const data = await html("/radio/");
      const albums = parseRadioCards(data);
      return { title: t("DJ歌单"), sections: [{ title: t("DJ歌单"), albums: albums }] };
    }
    const sheet = await album({ id: parts[1], page: pageNo });
    return {
      title: sheet.album.name,
      imageUrl: sheet.album.imageUrl,
      sections: [{ title: t("歌单曲目"), tracks: sheet.tracks }],
    };
  }

  if (head === "artists") {
    const data = await html("/djshow/");
    const artists = parseArtists(data);
    return { title: t("制作人"), sections: [{ title: t("制作人"), artists: artists }] };
  }

  if (head === "artist") {
    const info = await artist({ id: parts[1], page: pageNo });
    return {
      title: info.artist.name,
      sections: [{ title: t("制作人作品"), tracks: info.tracks }],
    };
  }

  if (head === "play") {
    const data = await html("/play/" + encodeURIComponent(parts[1]) + ".html");
    const info = parsePlay(data);
    const track = trackOf(parts[1], info.name || t("舞曲"), {
      imageUrl: info.cover,
      album: info.category ? { name: info.category } : undefined,
    });
    remember([track]);
    return { title: track.name, sections: [{ title: t("舞曲"), tracks: [track] }] };
  }

  if (head === "search") {
    const keyword = decodeURIComponent(parts.slice(1).join("/"));
    const result = await search({ query: keyword, offset: 0 });
    return { title: keyword, sections: [{ title: t("搜索结果"), tracks: result.tracks }] };
  }

  throw fail("not-found", t("没有这个页面"));
}

function hasNext(source, pageNo) {
  const next = Number(pageNo || 1) + 1;
  return new RegExp("(?:page=" + next + "\\b|/s0-" + next + "\\.html\\b|/" + next + "-0-0-0-1\\.html\\b)", "i").test(
    String(source || "")
  );
}

/* ------------------------------------------------------------------- search */

export async function search({ query, offset, kind }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));
  if (kind && kind !== "tracks") return { albums: [], more: false };

  const start = Math.max(0, Number(offset) || 0);
  const pageNo = Math.floor(start / PAGE_SIZE) + 1;
  const skip = start % PAGE_SIZE;
  const url = "/so/" + encodeURIComponent(keyword) + ".html" + (pageNo > 1 ? "?page=" + pageNo : "");
  const data = await html(url);
  const all = parseList(data);
  const tracks = all.slice(skip, skip + PAGE_SIZE);
  remember(tracks);
  return { tracks: tracks, more: tracks.length > 0 && (all.length >= PAGE_SIZE || hasNext(data, pageNo)) };
}

export function suggest({ query }) {
  const word = String(query || "").trim();
  if (!word) return HOT.slice(0, 6);
  const hits = HOT.filter((item) => item.indexOf(word) >= 0 || word.indexOf(item) >= 0);
  return (hits.length ? hits : HOT).slice(0, 6);
}

/* -------------------------------------------------------------- album/artist */

function parseArtists(source) {
  const chunks = String(source || "").split(/<div[^>]+class=["'][^"']*\babrow\b/i).slice(1);
  const artists = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const id = (/\/djshow\/(\d+)\.html/i.exec(chunk) || [])[1];
    if (!id || seen.has(id)) continue;
    const name = decode((/\/djshow\/\d+\.html[^>]*title=["']([^"']+)["']/i.exec(chunk) || [])[1] || "");
    const avatar = imageUrl((/<img[^>]+src=["']([^"']+)["']/i.exec(chunk) || [])[1]);
    if (name) {
      artists.push({ id, name, imageUrl: avatar });
      seen.add(id);
    }
  }
  return artists;
}

export async function album({ id, page }) {
  const pageNo = Number(page) || 1;
  const data = await html("/radio/" + encodeURIComponent(String(id)) + ".html");
  const name =
    textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(data) || [])[1] || "") || t("DJ歌单");
  const cover = imageUrl((/class=["'][^"']*\bpc-radio-cover\b[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(data) || [])[1]);
  const section = (/id=["']gd-list["'][^>]*>([\s\S]*?)<\/ul>/i.exec(data) || [])[1] || "";
  const tracks = [];
  const seen = new Set();
  const re = /<li[^>]*\bdata-mid=["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = re.exec(section))) {
    if (seen.has(match[1])) continue;
    const chunk = match[2];
    const title =
      decode((/<a[^>]+title=["']([^"']*)["']/i.exec(chunk) || [])[1] || "") ||
      textOf(chunk).replace(/^\d+\.\s*/, "");
    if (!title) continue;
    const link = (/<a[^>]+href=["']([^"']*musicid[^"']*)["']/i.exec(chunk) || [])[1];
    tracks.push(trackOf(match[1], title, { urlHint: link }));
    seen.add(match[1]);
  }
  remember(tracks);
  return {
    album: {
      id: String(id),
      name: name,
      imageUrl: cover,
      description: t("共 {count} 首").replace("{count}", String(tracks.length)),
    },
    tracks: tracks,
    more: false,
  };
}

export async function artist({ id, page }) {
  const pageNo = Number(page) || 1;
  const data = await html("/djshow/" + encodeURIComponent(String(id)) + ".html");
  const name = textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(data) || [])[1] || "") || t("制作人");
  const tracks = parseList(data);
  remember(tracks);
  return { artist: { id: String(id), name: name }, tracks: tracks, more: hasNext(data, pageNo) };
}

/* ------------------------------------------------------------------- playing */

export async function stream({ id }) {
  const data = await html("/play/" + encodeURIComponent(String(id)) + ".html", { timeout: 20000 });
  const info = parsePlay(data);
  if (!info.audio) throw fail("unavailable", t("这首没有可播放的地址"));
  const absolute = info.audio.indexOf("//") === 0 ? "https:" + info.audio : info.audio;
  const ext = (/\.(m4a|mp3|flac|aac|ogg|wav)(?:[?#]|$)/i.exec(absolute) || [])[1] || "m4a";
  return {
    url: absolute,
    type: ext.toLowerCase(),
    size: parseSize("SIZE " + (info.sizeText || "")),
    headers: { referer: BASE + "/play/" + String(id) + ".html", "user-agent": UA },
  };
}

export function lyrics() {
  return { lrc: "" };
}

/* ------------------------------------------------------------- local library */

const index = host.storage.get("trackIndex") || {};

function remember(tracks) {
  let changed = false;
  for (const track of tracks || []) {
    if (!track || !track.id) continue;
    const entry = { id: track.id, name: track.name, artists: track.artists, imageUrl: track.imageUrl };
    const old = index[track.id];
    if (!old || old.name !== entry.name) {
      index[track.id] = entry;
      changed = true;
    }
  }
  if (changed) host.storage.set("trackIndex", index);
}

function load(key, fallback) {
  const value = host.storage.get(key);
  return value == null ? fallback : value;
}

function trackById(id) {
  if (index[id]) return index[id];
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
