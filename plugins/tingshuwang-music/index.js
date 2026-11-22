// MyGo Music plugin — 听书网 (www.tingshuwang.cc)
//
// An audio-book site: every book page is UTF-8 HTML, no account, no cookie, and
// each chapter page carries the mp3/m4a link in a plain JS object.
//   home       GET /book/ and /book/rank.html       10 cards each
//   list       GET /book/index_<n>.html             10 books a page, 35 pages
//   by rank    GET /book/rank.html
//   category   GET /book/<category>/index_<n>.html
//   book       GET /book/<slug>/                    chapters, cover, cast
//   chapter    GET /book/<slug>/<cid>.html          chapter_data.videourl
//   audio      GET /d/file/<id>/<nnnn>.m4a          Range 206, no referer
//
// The site's own search (/e/search) answers "没有搜索到相关的内容" for every
// keyword as a guest, so search runs on an index the plugin builds from the
// sitemap and, when that misses, from the 35 list pages.

const BASE = "https://www.tingshuwang.cc";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function request(url, options = {}) {
  const init = { method: "GET", headers: Object.assign({}, HEAD, options.headers || {}) };
  const ms = options.timeout || 15000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    const res = await fetch(url, init);
    if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const pageCache = new Map();

async function fetchPage(path) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.html;
  const html = await request(url);
  pageCache.set(url, { at: Date.now(), html: html });
  return html;
}

/* ---------------------------------------------------------------- parsing */

function decode(text) {
  return String(text == null ? "" : text)
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|hellip|middot);/gi, (match, entity) => {
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
    });
}

function plain(html) {
  return decode(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absolute(url) {
  const clean = decode(url || "").trim();
  if (!clean) return "";
  if (clean.indexOf("//") === 0) return "https:" + clean;
  if (clean.indexOf("http") === 0) return clean;
  if (clean.charAt(0) === "/") return BASE + clean;
  return BASE + "/" + clean;
}

/* Cards look the same on the list, rank and category pages. */
function cards(html) {
  const items = [];
  const chunks = String(html).split('<div class="book">').slice(1);
  for (const chunk of chunks) {
    const head = /<div class="book-img">[\s\S]*?<a href="\/book\/([^"\/]+)\/"[^>]*title="([^"]*)"/i.exec(chunk);
    if (!head) continue;
    const cover = (/<img src="([^"]+)"/i.exec(chunk) || [])[1] || "";
    const author = (/<dd class="author">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(chunk) || [])[1] || "";
    const anchor = (/<dd class="anchor">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(chunk) || [])[1] || "";
    const category = (/<dd class="category">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(chunk) || [])[1] || "";
    const status = (/<dd class="status">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(chunk) || [])[1] || "";
    const update = (/<dd class="updatetime">更新时间：([^<]*)</i.exec(chunk) || [])[1] || "";
    const intro = (/<dd class="intro">([\s\S]*?)<\/dd>/i.exec(chunk) || [])[1] || "";

    const item = {
      slug: head[1],
      name: decode(head[2]).trim(),
      imageUrl: absolute(cover),
      author: plain(author),
      anchor: plain(anchor),
      category: plain(category),
      status: plain(status),
      update: decode(update).trim(),
      intro: plain(intro).slice(0, 160),
    };
    if (item.name) items.push(item);
  }
  return items;
}

function toAlbum(item) {
  const album = { id: "b:" + item.slug, name: item.name };
  if (item.imageUrl) album.imageUrl = item.imageUrl;
  if (item.anchor || item.author) album.artists = [{ name: item.anchor || item.author }];
  const notes = [item.author ? "作者：" + item.author : "", item.anchor ? "主播：" + item.anchor : "", item.status, item.category]
    .filter(Boolean)
    .join(" · ");
  if (notes) album.description = notes;
  return album;
}

function maxPageOf(html) {
  let max = 1;
  const re = /index_(\d+)\.html/g;
  const text = String(html || "");
  let match;
  while ((match = re.exec(text))) {
    const number = parseInt(match[1], 10);
    if (number > max) max = number;
  }
  return max;
}

function listTitle(html) {
  const match = /<title>([^<]*)<\/title>/i.exec(html);
  if (!match) return "";
  return decode(match[1]).replace(/\s*-\s*听书网\s*$/i, "").split(/[｜|]/)[0].trim();
}

/* --------------------------------------------------------------- book page */

function tidyChapter(text, bookTitle) {
  let label = String(text || "").trim();
  const prefix = new RegExp("^" + escapeRe(bookTitle) + "\\s*");
  label = label.replace(prefix, "").trim();
  /* 番外 links come as 2700_番外五:再次相聚, keep the wording and drop the number. */
  const extra = /^\d{2,5}_+(.+)$/.exec(label);
  if (extra) label = extra[1].trim();
  return label;
}

function chapterTextNumber(label) {
  const text = String(label || "").trim();
  if (/^(第)?\s*0*\d{1,5}\s*(章|集|回|节)?$/.test(text)) return parseInt(text.replace(/[^0-9]/g, ""), 10);
  if (/^第\s*\d+\s*(章|集|回|节)/.test(text)) return parseInt(text.replace(/[^0-9]/g, ""), 10);
  return chapterNumber(text);
}

function chapterNumber(label) {
  const chapter = /第\s*(\d+)\s*[章节回集]/.exec(label || "");
  if (chapter) return parseInt(chapter[1], 10);
  const digits = /(\d{1,5})/.exec(label || "");
  return digits ? parseInt(digits[1], 10) : 0;
}

function bookPage(html, slug) {
  const title = plain((/<div class="book-title">[\s\S]*?<h1>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || "");
  if (!title) return null;

  const cover = absolute(((/<div class="book-cover">[\s\S]*?<img src="([^"]+)"/i.exec(html) || [])[1] || "").replace(/&amp;/g, "&"));
  const status = plain((/<span class="status">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(html) || [])[1] || "");
  const author = plain((/<span class="author">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(html) || [])[1] || "");
  const anchor = plain((/<span class="auchor">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(html) || [])[1] || "");
  const category = plain((/<span class="category">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(html) || [])[1] || "");
  const update = decode((/<span class="update-time">[\s\S]*?<time>([^<]*)<\/time>/i.exec(html) || [])[1] || "").trim();

  const introBox = /<div class="book-desc-text">([\s\S]*?)<\/div>/i.exec(html);
  const intro = plain(introBox ? introBox[1] : ((/<div class="book-intro">([\s\S]*?)<a class="more"/i.exec(html) || [])[1] || ""));

  /* Both "latest chapters" and "all chapters" are on the page and overlap. */
  const seen = {};
  const byOrder = {};
  const chapters = [];
  const listBox = /<div class="book-chpater-list">([\s\S]*?)<\/div>/i.exec(html);
  const listHtml = listBox ? listBox[1] : html;
  const linkRe = new RegExp('<a href="/book/' + escapeRe(slug) + '/(\\d+)\\.html"[^>]*?title="([^"]*)"[^>]*>([^<]*)</a>', "gi");
  let match;
  while ((match = linkRe.exec(listHtml))) {
    const cid = match[1];
    if (seen[cid]) continue;
    seen[cid] = true;

    /* The site re-posts some chapters, so the page holds several links for one
       chapter number. Keep the first one it shows and drop the rest. */
    const text = decode(match[3]).trim();
    const titleText = decode(match[2]).trim();
    const label = tidyChapter(text || titleText, title);
    const order = chapterTextNumber(label);
    if (order && byOrder[order]) continue;
    if (order) byOrder[order] = true;

    const pretty = order ? "第" + order + "章" : label;
    /* A re-posted chapter keeps its own wording, such as 番外七; only plain
       numbers get rewritten so leading zeros and 章/集 mixing go away. */
    const keepWording = !/^(第)?\s*0*\d{1,5}\s*(章|集|回|节)?$/.test(label);
    chapters.push({ cid: cid, label: keepWording ? label : pretty, order: order });
  }

  chapters.sort((a, b) => {
    if (a.order && b.order) return a.order - b.order;
    if (a.order) return -1;
    if (b.order) return 1;
    return parseInt(a.cid, 10) - parseInt(b.cid, 10);
  });

  return {
    slug: slug,
    title: title,
    cover: cover,
    status: status,
    author: author,
    anchor: anchor,
    category: category,
    update: update,
    intro: intro,
    chapters: chapters,
  };
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const bookCache = new Map();

async function book(slug) {
  const cached = bookCache.get(slug);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const html = await fetchPage("/book/" + slug + "/");
  const data = bookPage(html, slug);
  if (!data) throw fail("unavailable", t("没有这本书"));
  bookCache.set(slug, { at: Date.now(), data: data });
  return data;
}

function tracksOf(info) {
  const tracks = [];
  for (const chapter of info.chapters) {
    const name = chapter.label || chapter.cid;
    tracks.push({
      id: "c:" + info.slug + ":" + chapter.cid,
      name: name,
      artists: info.anchor ? [{ name: info.anchor }] : info.author ? [{ name: info.author }] : undefined,
      imageUrl: info.cover || undefined,
      album: { id: "b:" + info.slug, name: info.title },
    });
  }
  return tracks;
}

/* ------------------------------------------------------------- chapter page */

function chapterPage(html, slug, cid) {
  const url = /videourl\s*:\s*'([^']+)'/.exec(html) || /videourl\s*:\s*"([^"]+)"/.exec(html);
  if (!url) return null;
  const name = /chaptername\s*:\s*'([^']*)'/.exec(html) || /chaptername\s*:\s*"([^"]*)"/.exec(html);
  const bookName = /bookname\s*:\s*'([^']*)'/.exec(html) || /bookname\s*:\s*"([^"]*)"/.exec(html);
  const kind = /videotype\s*:\s*'([^']*)'/.exec(html) || /videotype\s*:\s*"([^"]*)"/.exec(html);
  return {
    slug: slug,
    cid: cid,
    url: absolute(url[1]),
    name: name ? decode(name[1]).trim() : "",
    bookName: bookName ? decode(bookName[1]).trim() : "",
    kind: kind ? kind[1].toLowerCase() : "m4a",
  };
}

const chapterCache = new Map();

async function chapter(slug, cid) {
  const key = slug + ":" + cid;
  const cached = chapterCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const html = await fetchPage("/book/" + slug + "/" + cid + ".html");
  const data = chapterPage(html, slug, cid);
  if (!data) throw fail("unavailable", t("这一章没有音频"));
  chapterCache.set(key, { at: Date.now(), data: data });
  return data;
}

/* ----------------------------------------------------------------- search */

const SITEMAP = "/sitemap.html";

let index = host.storage.get("searchIndex") || null;

function isFresh(value, minutes) {
  return value && value.at && Date.now() - value.at < minutes * 60 * 1000;
}

async function quickIndex() {
  if (index && isFresh(index, 60) && index.quick) return index.entries;
  const html = await fetchPage(SITEMAP);
  const entries = [];
  const seen = {};
  const re = /<a href="\/book\/([^"\/]+)\/"[^>]*title="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const slug = match[1];
    if (seen[slug]) continue;
    seen[slug] = true;
    entries.push({ slug: slug, name: decode(match[2] || match[3]).trim() });
  }
  index = { at: Date.now(), quick: true, entries: entries };
  host.storage.set("searchIndex", index);
  return entries;
}

/* The list pages know the cast and the cover, which the sitemap does not. */
async function fullIndex() {
  if (index && isFresh(index, 60) && !index.quick && index.entries && index.entries.length > 300) {
    return index.entries;
  }

  const pages = [];
  for (let n = 1; n <= 35; n += 1) pages.push(n === 1 ? "/book/" : "/book/index_" + n + ".html");
  const entries = [];
  const seen = {};

  const worker = async (path) => {
    try {
      const html = await fetchPage(path);
      for (const item of cards(html)) {
        if (seen[item.slug]) continue;
        seen[item.slug] = true;
        entries.push(item);
      }
    } catch (error) {
      /* one page failing still leaves the rest */
    }
  };

  const batch = 6;
  for (let i = 0; i < pages.length; i += batch) {
    await Promise.all(pages.slice(i, i + batch).map(worker));
  }

  if (!entries.length) return quickIndex();
  index = { at: Date.now(), quick: false, entries: entries };
  host.storage.set("searchIndex", index);
  return entries;
}

function matches(entry, keyword) {
  const needle = keyword.toLowerCase();
  const name = (entry.name || "").toLowerCase();
  const slug = (entry.slug || "").toLowerCase();
  const cast = ((entry.anchor || "") + " " + (entry.author || "")).toLowerCase();
  return name.indexOf(needle) >= 0 || slug.indexOf(needle) >= 0 || cast.indexOf(needle) >= 0;
}

async function findBooks(keyword, offset) {
  let entries = null;
  if (index && isFresh(index, 60) && !index.quick) entries = index.entries;
  else entries = await quickIndex();

  let hits = entries.filter((entry) => matches(entry, keyword));

  /* A cold or rare word: the sitemap only holds the popular books, so build the
     full list once. It is cached and later searches skip this. */
  if (hits.length === 0) {
    try {
      const full = await fullIndex();
      if (full && full.length) {
        entries = full;
        hits = entries.filter((entry) => matches(entry, keyword));
      }
    } catch (error) {
      /* keep the sitemap answer */
    }
  }

  return { hits: hits, start: Math.max(0, Number(offset) || 0) };
}

export async function search({ query, offset, kind }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));
  if (kind && kind !== "albums" && kind !== "tracks") {
    const empty = {};
    empty[kind === "artists" ? "artists" : kind === "playlists" ? "playlists" : kind === "shows" ? "shows" : "albums"] = [];
    empty.more = false;
    return empty;
  }

  const found = await findBooks(keyword, offset);
  const all = found.hits.map((entry) =>
    entry.imageUrl !== undefined ? toAlbum(entry) : { id: "b:" + entry.slug, name: entry.name },
  );
  const albums = all.slice(found.start, found.start + 20);
  if (kind === "tracks") {
    return { tracks: [], more: false };
  }
  return { albums: albums, more: found.start + 20 < all.length };
}

export function suggest({ query }) {
  const categories = [
    t("玄幻武侠"),
    t("都市言情"),
    t("恐怖悬疑"),
    t("综艺娱乐"),
    t("网游竞技"),
    t("军事历史"),
    t("刑侦推理"),
    t("职场商战"),
    t("连载"),
    t("完本"),
  ];
  const words = String(query || "").trim();
  if (!words) return categories;
  return categories.filter((name) => name.indexOf(words) >= 0);
}

/* ------------------------------------------------------------------ pages */

const CATEGORIES = {
  xuanhuanwuxia: "玄幻武侠",
  dushiyanqing: "都市言情",
  kongbuxuanyi: "恐怖悬疑",
  zongyiyule: "综艺娱乐",
  wangyoujingji: "网游竞技",
  junshilishi: "军事历史",
  tuilixiaoshuo: "刑侦推理",
  zhichangshangzhan: "职场商战",
  lianzai: "连载有声小说",
  wanjie: "完本有声小说",
};

export async function home() {
  const [latestHtml, rankHtml] = await Promise.all([
    fetchPage("/book/").catch(() => ""),
    fetchPage("/book/rank.html").catch(() => ""),
  ]);

  /* Warm the catalogue in the background, so the first search does not wait
     for all 35 list pages. */
  if (!(index && isFresh(index, 60) && !index.quick)) fullIndex().catch(() => {});

  const sections = [];
  const latest = cards(latestHtml).map(toAlbum);
  const rank = cards(rankHtml).map(toAlbum);

  if (rank.length) sections.push({ title: t("人气榜"), albums: rank.slice(0, 10) });
  if (latest.length) sections.push({ title: t("最新上架"), albums: latest.slice(0, 10), morePage: "latest/2" });
  if (!sections.length) throw fail("unavailable", t("站点没有返回内容"));
  return { title: t("听书网"), sections: sections };
}

function splitPage(value) {
  const clean = String(value || "").replace(/^\/+|\/+$/g, "");
  const numbered = /^(.*?)\/(\d+)$/.exec(clean);
  if (numbered) {
    if (numbered[1] === "latest" || /^category\/[a-z]+$/.test(numbered[1])) {
      return { base: numbered[1], page: parseInt(numbered[2], 10) || 1 };
    }
  }
  return { base: clean, page: 1 };
}

function listPath(base, pageNo) {
  const head = pageNo === 1 ? "" : "index_" + pageNo + ".html";
  if (base === "rank") return pageNo === 1 ? "/book/rank.html" : "";
  if (base === "latest") return "/book/" + head;
  const category = /^category\/([a-z]+)$/.exec(base);
  if (category) return "/book/" + category[1] + "/" + head;
  return "";
}

export async function browse({ page }) {
  const split = splitPage(page);
  const pageNo = split.page || 1;

  const list = listPath(split.base, pageNo);
  if (list) {
    const html = await fetchPage(list);
    const items = cards(html).map(toAlbum);
    if (!items.length) throw fail("unavailable", t("这一页没有内容"));
    const category = /^category\/([a-z]+)$/.exec(split.base);
    const title =
      split.base === "rank"
        ? t("人气榜")
        : split.base === "latest"
          ? t("最新上架")
          : category
            ? CATEGORIES[category[1]] || t("分类")
            : listTitle(html);
    return {
      title: title,
      sections: [
        {
          title: title,
          albums: items,
          morePage: split.base !== "rank" && pageNo < maxPageOf(html) ? split.base + "/" + (pageNo + 1) : undefined,
        },
      ],
    };
  }

  const bookPath = /^book\/([^/]+)$/.exec(split.base);
  if (bookPath) {
    const detail = await album({ id: "b:" + bookPath[1] });
    return {
      title: detail.album.name,
      description: detail.album.description,
      sections: [{ title: t("章节"), tracks: detail.tracks }],
    };
  }

  const chapterPath = /^chapter\/([^/]+)\/(\d+)$/.exec(split.base);
  if (chapterPath) {
    const info = await chapter(chapterPath[1], chapterPath[2]);
    const track = {
      id: "c:" + info.slug + ":" + info.cid,
      name: info.name || info.cid,
      album: { id: "b:" + info.slug, name: info.bookName || "" },
    };
    remember([track]);
    return { title: track.name, sections: [{ title: info.bookName || t("章节"), tracks: [track] }] };
  }

  throw fail("unavailable", t("没有这个页面"));
}

export async function album({ id }) {
  const key = String(id || "");
  const slug = key.indexOf("b:") === 0 ? key.slice(2) : key;
  const info = await book(slug);

  const notes = [
    info.author ? "作者：" + info.author : "",
    info.anchor ? "主播：" + info.anchor : "",
    info.category ? "分类：" + info.category : "",
    info.status,
    info.chapters.length ? "共 " + info.chapters.length + " 章" : "",
    info.update ? "更新：" + info.update : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const description = [info.intro, notes].filter(Boolean).join("\n");
  const tracks = tracksOf(info);
  remember(tracks);

  return {
    album: {
      id: "b:" + info.slug,
      name: info.title,
      imageUrl: info.cover || undefined,
      artists: info.anchor ? [{ name: info.anchor }] : info.author ? [{ name: info.author }] : undefined,
      description: description,
    },
    tracks: tracks,
  };
}

export async function artist({ id }) {
  const raw = String(id || "");
  let name = raw.indexOf("a:") === 0 ? raw.slice(2) : raw;
  try {
    name = decodeURIComponent(name);
  } catch (error) {
    /* keep the raw name */
  }
  name = name.trim();

  const trimmed = name.replace(/[，,、/]/g, "").slice(0, 20);
  const paths = [
    "/announcer/" + encodeURIComponent(trimmed) + "/",
    "/author/" + encodeURIComponent(trimmed) + "/",
  ];

  let albums = [];
  for (const path of paths) {
    try {
      const html = await fetchPage(path);
      albums = cards(html).map(toAlbum);
      if (albums.length) break;
    } catch (error) {
      /* try the next page */
    }
  }

  return {
    artist: {
      id: "a:" + name,
      name: name,
      imageUrl: albums.length ? albums[0].imageUrl : undefined,
    },
    tracks: [],
    albums: albums.slice(0, 30),
  };
}

/* ------------------------------------------------------------------ audio */

const TYPE_OF = { m4a: "m4a", mp3: "mp3", aac: "aac" };

export async function stream({ id }) {
  const key = String(id || "");
  const parts = /^c:([^:]+):(\d+)$/.exec(key);
  if (!parts) throw fail("invalid", t("没有这一章"));

  const info = await chapter(parts[1], parts[2]);
  const ext = (info.url.split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1] || info.kind || "m4a";
  const type = TYPE_OF[ext.toLowerCase()] || "m4a";
  return { url: info.url, type: type };
}

export function lyrics() {
  return { lrc: "" };
}

/* ------------------------------------------------------------------ library */

const trackIndex = host.storage.get("trackIndex") || {};

function remember(tracks) {
  let changed = false;
  for (const track of tracks) {
    if (!track || !track.id) continue;
    const entry = { id: track.id, name: track.name, artists: track.artists, imageUrl: track.imageUrl };
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
  return liked[id] || { id: id, name: id };
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
