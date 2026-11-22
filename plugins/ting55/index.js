// 恋听网（ting55.com）— MyGo Music 插件
//
// 站点是有声小说站：一本书是专辑，每一集是曲目。书籍页直接列出全部集数；
// 播放地址不在页面里，而是章节页带着一次性 token 调 POST /nlinka 换取，
// 需要同时带上章节页的 xt 头和 l: 1。音频由 pp.ting55.com 提供。

const BASE = "https://ting55.com";
const MOBILE = "https://m.ting55.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const PAGE_TTL = 5 * 60 * 1000;
const LIKE_KEY = "ting55:liked";
const RECENT_KEY = "ting55:recent";

const t = (text) => host.t(text);
const pageCache = new Map();

const CATEGORIES = {
  1: "玄幻",
  2: "武侠",
  3: "都市",
  4: "言情",
  5: "穿越",
  6: "科幻",
  7: "推理",
  8: "恐怖",
  9: "惊悚",
  10: "历史",
  11: "经典",
  12: "相声",
  13: "百家讲坛",
  14: "评书",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function clean(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function absolute(url) {
  if (!url) return "";
  let value = url;
  if (value.startsWith("//")) value = "https:" + value;
  else if (value.startsWith("/")) value = BASE + value;
  return value.replace(/!120$/, "!300").replace(/!180$/, "!300").replace(/!240$/, "!300");
}

function imageFrom(block) {
  const match = /<img[^>]*src="([^"]+)"/i.exec(block);
  return match ? absolute(match[1]) : "";
}

function bookName(value) {
  return clean(value)
    .replace(/有声小说$/i, "")
    .replace(/\s+有声小说$/i, "")
    .trim();
}

function albumCard(id, name, imageUrl) {
  return { id: String(id), name: bookName(name) || t("未命名"), imageUrl: imageUrl || "" };
}

async function fetchText(path, cache = true) {
  const url = path.startsWith("http") ? path : BASE + path;
  const hit = pageCache.get(url);
  if (cache && hit && Date.now() - hit.at < PAGE_TTL) return hit.text;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": UA,
          referer: REFERER,
          accept: "text/html,application/xhtml+xml,*/*",
        },
      });
      if (response.ok) {
        const text = await response.text();
        if (cache) pageCache.set(url, { text, at: Date.now() });
        return text;
      }
      lastError = fail("unavailable", `站点返回 ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500 + attempt * 600);
  }
  throw lastError || fail("unavailable", "站点暂时无法访问");
}

function parseBooks(html) {
  const out = [];
  const seen = new Set();
  for (const block of String(html).match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []) {
    const link = /<a[^>]*href="\/book\/(\d+)"/i.exec(block);
    if (!link || seen.has(link[1])) continue;
    seen.add(link[1]);
    const anchor = link[0];
    const img = /<img[^>]*>/i.exec(block);
    const imgTag = img ? img[0] : "";
    const title =
      clean((/title="([^"]*)"/i.exec(anchor) || [])[1]) ||
      clean((/title="([^"]*)"/i.exec(imgTag) || [])[1]) ||
      clean((/alt="([^"]*)"/i.exec(imgTag) || [])[1]) ||
      clean((/<h[234][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(block) || [])[1]) ||
      clean((/<a[^>]*href="\/book\/\d+"[^>]*>([\s\S]*?)<\/a>/i.exec(block) || [])[1]);
    const src = /src="([^"]+)"/i.exec(imgTag);
    out.push(albumCard(link[1], title, src ? absolute(src[1]) : ""));
  }
  if (!out.length) {
    for (const match of String(html).matchAll(/<a[^>]*href="\/book\/(\d+)"[^>]*title="([^"]*)"[^>]*>/gi)) {
      if (seen.has(match[1])) continue;
      seen.add(match[1]);
      out.push(albumCard(match[1], match[2], ""));
    }
  }
  return out;
}

function parseBookDetail(html, id) {
  const title = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1]);
  const name = bookName(title) || t("有声小说");
  const img = /<div class="bimg"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i.exec(html);
  const artists = [];
  const seenArtists = new Set();
  const byBlock = /<p>\s*播音：([\s\S]*?)<\/p>/i.exec(html);
  if (byBlock) {
    for (const match of byBlock[1].matchAll(/<a[^>]*href="\/byy\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (seenArtists.has(match[1])) continue;
      seenArtists.add(match[1]);
      artists.push({ id: match[1], name: clean(match[2]) });
    }
  }
  const intro = clean((/<div class="intro"[^>]*>([\s\S]*?)<\/div>/i.exec(html) || [])[1]);
  const released = clean((/<p>\s*时间：([\s\S]*?)<\/p>/i.exec(html) || [])[1]).slice(0, 10);
  const tracks = [];
  const seen = new Set();
  for (const match of String(html).matchAll(
    /<a[^>]*href="\/book\/(\d+)-(\d+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const key = `${match[1]}-${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push(makeTrack(key, `${t("第")}${match[2]}${t("集")}`, artists, {
      id: String(id),
      name,
      imageUrl: img ? absolute(img[1]) : "",
    }));
  }
  if (!tracks.length) {
    for (const match of String(html).matchAll(/href="\/book\/(\d+)-(\d+)"/gi)) {
      const key = `${match[1]}-${match[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push(makeTrack(key, `${t("第")}${match[2]}${t("集")}`, artists, {
        id: String(id),
        name,
        imageUrl: img ? absolute(img[1]) : "",
      }));
    }
  }
  const album = {
    id: String(id),
    name,
    imageUrl: img ? absolute(img[1]) : "",
    artists,
    released,
    description: intro,
  };
  return { album, tracks };
}

function makeTrack(id, name, artists, album) {
  return {
    id: String(id),
    name: clean(name) || t("未命名"),
    artists: (artists || []).map((item) => ({ id: String(item.id || ""), name: clean(item.name) })),
    album: {
      id: String(album.id || ""),
      name: clean(album.name),
      imageUrl: album.imageUrl || "",
    },
    duration: 0,
    url: `${BASE}/book/${id}`,
  };
}

function sectionByClass(html, cls) {
  const pattern = new RegExp(`<section[^>]*class="[^"]*${cls}[^"]*"[^>]*>[\\s\\S]*?<\\/section>`, "i");
  const match = pattern.exec(html);
  return match ? match[0] : "";
}

function parseHome(html) {
  const sections = [];
  const pic = sectionByClass(html, "pic");
  if (pic) {
    const title = clean((/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(pic) || [])[1]) || t("精品有声小说");
    const albums = parseBooks(pic);
    if (albums.length) sections.push({ title, albums, morePage: { page: "tuijian:1", pageTitle: t("推荐") } });
  }
  const latest = sectionByClass(html, "h-new");
  if (latest) {
    const albums = parseBooks(latest);
    if (albums.length) sections.push({ title: t("最新有声小说"), albums, morePage: { page: "tuijian:1", pageTitle: t("推荐") } });
  }
  const whole = sectionByClass(html, "h-whole");
  if (whole) {
    const albums = parseBooks(whole);
    if (albums.length) sections.push({ title: t("全本有声小说"), albums, morePage: { page: "tuijian:1", pageTitle: t("推荐") } });
  }
  for (const match of String(html).matchAll(/<section[^>]*class="[^"]*h-category[^"]*"[^>]*>[\s\S]*?<\/section>/gi)) {
    const block = match[0];
    const heading = clean((/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block) || [])[1]);
    const albums = parseBooks(block);
    if (!albums.length) continue;
    const link = /<h2[^>]*>[\s\S]*?<a[^>]*href="\/category\/(\d+)"/i.exec(block);
    sections.push({
      title: heading || t("有声小说"),
      albums,
      morePage: link ? { page: `category:${link[1]}:1`, pageTitle: heading } : undefined,
    });
  }
  return { title: t("恋听网"), sections };
}

function listPath(kind, id, page) {
  const n = Math.max(1, Number(page) || 1);
  if (kind === "tuijian") return n === 1 ? "/tuijian" : `/tuijian/page/${n}`;
  if (kind === "paihang") return n === 1 ? `/paihang/${id}` : `/paihang/${id}/page/${n}`;
  return n === 1 ? `/category/${id}` : `/category/${id}/page/${n}`;
}

function leftBlock(html) {
  const start = String(html).indexOf('<div class="left"');
  if (start < 0) return String(html);
  const aside = String(html).indexOf("<aside", start);
  const right = String(html).indexOf('<div class="right"', start);
  let end = String(html).length;
  if (aside >= 0) end = Math.min(end, aside);
  if (right >= 0) end = Math.min(end, right);
  return String(html).slice(start, end);
}

function parseListPage(html, title, kind, id, page) {
  const albums = parseBooks(leftBlock(html));
  return {
    title,
    sections: [
      {
        title,
        albums,
        morePage: albums.length ? { page: `${kind}:${id}:${Number(page) + 1}`, pageTitle: title } : undefined,
        empty: albums.length ? "" : t("这一页没有内容"),
      },
    ],
  };
}

function parseSearch(html) {
  return parseBooks(leftBlock(html));
}

function chapterMeta(html) {
  const meta = (name) => {
    const match = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, "i").exec(html);
    return match ? match[1] : "";
  };
  return {
    token: meta("_c"),
    bookId: meta("_b"),
    page: meta("_cp"),
    isPay: meta("_p"),
    title: clean(meta("_t") || (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1]),
    bookTitle: clean(meta("_pt")),
  };
}

function chapterTrack(id, meta) {
  const parts = String(id).split("-");
  const bookId = parts[0];
  const page = parts[1] || "1";
  const artists = [];
  return makeTrack(id, meta.title || `${t("第")}${page}${t("集")}`, artists, {
    id: bookId,
    name: bookName(meta.bookTitle) || t("有声小说"),
    imageUrl: "",
  });
}

async function audioUrl(id) {
  const parts = String(id).split("-");
  const bookId = parts[0];
  const page = parts[1] || "1";
  const chapterPath = `/book/${bookId}-${page}`;
  const html = await fetchText(chapterPath, false);
  const meta = chapterMeta(html);
  if (!meta.token || meta.bookId !== String(bookId)) {
    throw fail("unavailable", t("这一集暂时无法播放"));
  }
  const body = `bookId=${encodeURIComponent(meta.bookId)}&isPay=${encodeURIComponent(
    meta.isPay || "0",
  )}&page=${encodeURIComponent(meta.page || page)}`;
  const headers = {
    "user-agent": UA,
    referer: BASE + chapterPath,
    origin: BASE,
    "content-type": "application/x-www-form-urlencoded",
    xt: meta.token,
    l: "1",
    accept: "application/json,text/plain,*/*",
  };
  try {
    const response = await fetch(BASE + "/nlinka", { method: "POST", headers, body });
    if (response.ok) {
      const data = await response.json();
      if (data && data.status !== -1) {
        const direct = data.ourl || "";
        if (direct) return direct;
        if (data.url) return data.url + (data.url.includes("?") ? "&" : "?") + "v=" + Date.now();
      }
    }
  } catch (error) {
    // 桌面接口不可用时继续尝试移动接口
  }
  const mobileHtml = await fetchText(`${MOBILE}/book/${bookId}-${page}`, false);
  const mobileMeta = chapterMeta(mobileHtml);
  if (!mobileMeta.token) throw fail("unavailable", t("这一集暂时无法播放"));
  const mobileBody = `bookId=${encodeURIComponent(bookId)}&isPay=${encodeURIComponent(
    mobileMeta.isPay || "0",
  )}&page=${encodeURIComponent(mobileMeta.page || page)}`;
  const mobileResponse = await fetch(MOBILE + "/glink", {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      referer: `${MOBILE}/book/${bookId}-${page}`,
      origin: MOBILE,
      "content-type": "application/x-www-form-urlencoded",
      xt: mobileMeta.token,
      accept: "application/json,text/plain,*/*",
    },
    body: mobileBody,
  });
  if (!mobileResponse.ok) throw fail("unavailable", t("这一集暂时无法播放"));
  const mobileData = await mobileResponse.json();
  if (mobileData && mobileData.ourl) return mobileData.ourl;
  if (mobileData && mobileData.url) return mobileData.url + "?v=" + Date.now();
  throw fail("unavailable", t("这一集暂时没有可用的音频"));
}

function storedList(key) {
  const value = host.storage.get(key);
  return Array.isArray(value) ? value : [];
}

function trackFromStored(item) {
  return makeTrack(item.id, item.name, item.artists || [], {
    id: item.albumId || String(item.id).split("-")[0],
    name: item.albumName || t("有声小说"),
    imageUrl: item.imageUrl || "",
  });
}

async function describe(id) {
  const parts = String(id).split("-");
  const html = await fetchText(`/book/${parts[0]}-${parts[1] || "1"}`, false);
  const meta = chapterMeta(html);
  return {
    id: String(id),
    name: meta.title || `${t("第")}${parts[1] || "1"}${t("集")}`,
    albumId: parts[0],
    albumName: bookName(meta.bookTitle) || t("有声小说"),
    imageUrl: "",
    artists: [],
  };
}

export async function home() {
  return parseHome(await fetchText("/", false));
}

export async function browse({ page } = {}) {
  const value = String(page || "home");
  if (!value || value === "home") return home();
  const parts = value.split(":");
  const kind = parts[0];
  if (kind === "tuijian" || kind === "category" || kind === "paihang") {
    const id = kind === "tuijian" ? "" : parts[1] || "1";
    const pageNo = Math.max(1, parseInt(parts[2] || "1", 10) || 1);
    const title =
      kind === "tuijian" ? t("推荐") : `${CATEGORIES[id] || t("有声小说")}${kind === "paihang" ? t("排行榜") : ""}`;
    const html = await fetchText(listPath(kind, id, pageNo));
    return parseListPage(html, title, kind, id, pageNo);
  }
  return home();
}

export async function search({ query, kind, offset } = {}) {
  const keyword = String(query || "").trim();
  if (!keyword) return { tracks: [], albums: [], more: false };
  const html = await fetchText(`/search/${encodeURIComponent(keyword)}`, false);
  const albums = parseSearch(html);
  if (kind === "albums") return { albums, more: false };
  if (kind === "artists" || kind === "playlists" || kind === "shows") {
    return { tracks: [], albums, more: false };
  }
  const tracks = [];
  for (const item of albums.slice(0, 6)) {
    try {
      const detail = parseBookDetail(await fetchText(`/book/${item.id}`, false), item.id);
      if (detail.tracks.length) {
        tracks.push({
          ...detail.tracks[0],
          name: item.name,
          album: { id: item.id, name: item.name, imageUrl: item.imageUrl || "" },
        });
      }
    } catch (error) {
      // 个别书籍页打不开时略过
    }
  }
  return { tracks, albums, more: false };
}

export async function suggest({ query } = {}) {
  if (!String(query || "").trim()) return [];
  const result = await search({ query, kind: "albums" });
  return (result.albums || []).slice(0, 8).map((item) => item.name);
}

export async function album({ id } = {}) {
  const html = await fetchText(`/book/${id}`);
  return parseBookDetail(html, id);
}

export async function artist({ id } = {}) {
  const html = await fetchText(`/byy/${id}`);
  const bread = clean((/<div class="bread"[^>]*>([\s\S]*?)<\/div>/i.exec(html) || [])[1]);
  const title = clean((/<title>([^<]*)<\/title>/i.exec(html) || [])[1]);
  const name = bread.split(">").pop().trim() || title.split("_")[0];
  return {
    artist: { id: String(id), name, imageUrl: "", description: "" },
    tracks: [],
    albums: parseBooks(leftBlock(html)),
  };
}

export async function lyrics() {
  return {};
}

export async function stream({ id } = {}) {
  const url = await audioUrl(id);
  const chapterPath = `/book/${id}`;
  return { url, type: "mp3", headers: { referer: `${BASE}${chapterPath}` }, size: 0, gain: 0, peak: 0 };
}

export async function like({ id, on } = {}) {
  const items = storedList(LIKE_KEY);
  const key = String(id);
  let next = items.filter((item) => item.id !== key);
  if (on) {
    try {
      next.unshift(await describe(key));
    } catch (error) {
      next.unshift({ id: key, name: `${t("第")}${key.split("-")[1] || "1"}${t("集")}`, albumId: key.split("-")[0], albumName: t("有声小说") });
    }
  }
  host.storage.set(LIKE_KEY, next);
  return { on: Boolean(on) };
}

export async function isLiked({ ids } = {}) {
  const set = new Set(storedList(LIKE_KEY).map((item) => item.id));
  const result = {};
  for (const id of ids || []) result[String(id)] = set.has(String(id));
  return result;
}

export async function liked({ offset } = {}) {
  const start = Math.max(0, Number(offset) || 0);
  return { tracks: storedList(LIKE_KEY).slice(start, start + 40).map(trackFromStored), more: false };
}

export async function played({ id } = {}) {
  const items = storedList(RECENT_KEY);
  const key = String(id);
  let next = items.filter((item) => item.id !== key);
  try {
    next.unshift(await describe(key));
  } catch (error) {
    next.unshift({ id: key, name: `${t("第")}${key.split("-")[1] || "1"}${t("集")}`, albumId: key.split("-")[0], albumName: t("有声小说") });
  }
  host.storage.set(RECENT_KEY, next.slice(0, 40));
  return {};
}

export async function recent() {
  return storedList(RECENT_KEY).map(trackFromStored);
}
