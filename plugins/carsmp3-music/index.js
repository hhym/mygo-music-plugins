// 显示名：汽车音乐网（carsmp3-music）
// MyGo Music plugin — 汽车音乐网 (www.carsmp3.com)
//
// A Discuz! forum that hands out lossless car audio: every thread is one album
// (or a collection), with a net-disk download that only shows up after a reply.
// There is no audio file on the site — the threads preview with APlayer + Meting,
// i.e. NetEase Cloud Music.
//
// So the plugin is a catalogue first, and it listens through the same door the
// site uses:
//   home        GET  /                         portal blocks, with covers
//   board       GET  /forum-<fid>-<page>.html  20 threads a page
//   thread      GET  /thread-<tid>-1-1.html    title, author, cover, post text
//   preview     GET  api.i-meto.com/meting     NetEase search for the thread title
//   audio       GET  api.injahow.cn/meting     302 -> the mp3 on music.126.net
//   lyric       GET  api.injahow.cn/meting     plain LRC text
//
// Everything the site serves is GBK, so pages are decoded with TextDecoder("gbk").
// Downloads are left out on purpose: they need a login and a reply.

const BASE = "https://www.carsmp3.com";
const METING = "https://api.i-meto.com/meting/api";
const MEDIA = "https://api.injahow.cn/meting/";

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
  const headers = Object.assign({}, HEAD, options.headers || {});
  const init = { method: options.method || "GET", headers: headers };
  if (options.redirect) init.redirect = options.redirect;
  const ms = options.timeout || 15000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    return await fetch(url, init);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- decoding */

let gbkDecoder = null;

function decodeBytes(buffer) {
  if (!gbkDecoder) {
    try {
      gbkDecoder = new TextDecoder("gbk");
    } catch (error) {
      gbkDecoder = new TextDecoder("utf-8");
    }
  }
  return gbkDecoder.decode(buffer);
}

const pageCache = new Map();

async function page(path) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.html;
  const res = await request(url);
  if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const html = decodeBytes(bytes);
  pageCache.set(url, { at: Date.now(), html: html });
  return html;
}

async function jsonp(url, options = {}) {
  const res = await request(url, {
    timeout: options.timeout,
    headers: { accept: "application/json, text/plain, */*" },
  });
  if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw fail("unavailable", t("接口没有返回数据"));
  }
}

/* ---------------------------------------------------------------- parsing */

function decode(text) {
  return String(text == null ? "" : text)
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|hellip|mdash|middot);/gi, (match, entity) => {
      const name = entity.toLowerCase();
      if (name === "amp") return "&";
      if (name === "lt") return "<";
      if (name === "gt") return ">";
      if (name === "quot") return '"';
      if (name === "apos") return "'";
      if (name === "nbsp") return " ";
      if (name === "hellip") return "…";
      if (name === "mdash") return "—";
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

function pageTitle(html) {
  const match = /<title>([^<]*)<\/title>/i.exec(html);
  if (!match) return "";
  const text = decode(match[1]).replace(/\s*-\s*汽车音乐网\s*$/i, "").trim();
  const head = text.split(/[｜|]/)[0];
  return head.split(/[，,]/)[0].trim();
}

/* The portal puts every board in its own block, with a cover per thread. */
function portalBlocks(html) {
  const blocks = [];
  const starts = [];
  const startRe = /<div id="portal_block_\d+"[^>]*class="[^"]*block[^"]*"[^>]*>/gi;
  let match;
  while ((match = startRe.exec(html))) starts.push(match.index);

  for (let i = 0; i < starts.length; i += 1) {
    const chunk = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : html.length);
    const head = /<span class="titletext[^"]*"[^>]*><a href="([^"]*forum-(\d+)-1\.html)"[^>]*>([^<]+)<\/a>/i.exec(chunk);
    if (!head) continue;

    const covers = {};
    const coverRe = /<dd class="m">\s*<a href="([^"]*thread-(\d+)-1-1\.html)"[^>]*>\s*<img src="([^"]+)"/gi;
    while ((match = coverRe.exec(chunk))) covers[match[2]] = absolute(match[3]);

    const items = [];
    const itemRe = /<dt><a href="([^"]*thread-(\d+)-1-1\.html)"[^>]*>([^<]*)<\/a><\/dt>/gi;
    let introRe = /<dd>([\s\S]*?)<\/dd>/gi;
    let intro = null;
    const intros = [];
    while ((intro = introRe.exec(chunk))) intros.push(plain(intro[1]).slice(0, 40));
    let index = 0;
    while ((match = itemRe.exec(chunk))) {
      const tid = match[2];
      items.push({
        id: tid,
        name: decode(match[3]).trim(),
        imageUrl: covers[tid],
        subtitle: intros[index] || "",
      });
      index += 1;
    }

    /* Boards without a cover show a plain date + title list instead. */
    const lineRe = /<li><em>([^<]*)<\/em><a href="([^"]*thread-(\d+)-1-1\.html)"[^>]*>([^<]*)<\/a><\/li>/gi;
    while ((match = lineRe.exec(chunk))) {
      items.push({ id: match[3], name: decode(match[4]).trim(), subtitle: decode(match[1]).trim() });
    }

    if (!items.length) continue;
    const seen = {};
    const unique = items.filter((item) => {
      if (seen[item.id]) return false;
      seen[item.id] = true;
      return !!item.name;
    });
    blocks.push({ fid: head[2], title: decode(head[3]).trim(), items: unique });
  }

  /* One board can show up twice (a cover block and a text block); keep the
     first one that has covers, but merge the rest into it. */
  const merged = [];
  const byId = {};
  for (const block of blocks) {
    const known = byId[block.fid];
    if (!known) {
      byId[block.fid] = block;
      merged.push(block);
      continue;
    }
    for (const item of block.items) {
      if (known.items.some((other) => other.id === item.id)) continue;
      known.items.push(item);
    }
  }
  return merged;
}

function toAlbum(item) {
  const album = { id: item.id, name: item.name };
  if (item.imageUrl) album.imageUrl = item.imageUrl;
  if (item.subtitle) album.description = item.subtitle;
  return album;
}

/* Board pages: sticky and normal threads live in tbody#stickthread_/normalthread_. */
function forumPage(html) {
  const entries = [];
  const rows = [];
  const rowRe = /<tbody id="(stick|normal)thread_(\d+)">/gi;
  let match;
  while ((match = rowRe.exec(html))) rows.push({ at: match.index, sticky: match[1] === "stick", tid: match[2] });

  for (let i = 0; i < rows.length; i += 1) {
    const chunk = html.slice(rows[i].at, i + 1 < rows.length ? rows[i + 1].at : html.length);
    const titleMatch = /class="xst"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
    if (!titleMatch) continue;
    const authorMatch = /<td class="by"><cite>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(chunk);
    const dateMatch = /<td class="by">[\s\S]*?<em>(?:<span>)?([^<]+)/i.exec(chunk);
    const numMatch = /<td class="num"><a[^>]*>\d*<\/a><em>([^<]*)<\/em>/i.exec(chunk);
    const tagMatch = /<em>\[<a[^>]*>([^<]*)<\/a>\]<\/em>/i.exec(chunk);
    const repliesMatch = /<td class="num"><a[^>]*>([^<]*)<\/a>/i.exec(chunk);

    const entry = {
      id: rows[i].tid,
      name: plain(titleMatch[1]),
      sticky: rows[i].sticky,
    };
    if (authorMatch) entry.author = plain(authorMatch[1]);
    if (dateMatch) entry.date = decode(dateMatch[1]).trim();
    if (tagMatch) entry.tag = decode(tagMatch[1]).trim();
    if (repliesMatch) entry.replies = parseInt(plain(repliesMatch[1]), 10) || 0;
    if (numMatch) entry.views = parseInt(plain(numMatch[1]), 10) || 0;
    if (entry.name) entries.push(entry);
  }

  const totalMatch = /共\s*(\d+)\s*页/i.exec(html);
  return {
    title: pageTitle(html),
    entries: entries,
    totalPages: totalMatch ? parseInt(totalMatch[1], 10) : 1,
  };
}

function threadPage(html, tid) {
  const titleMatch = /<span id="thread_subject"[^>]*>([\s\S]*?)<\/span>/i.exec(html);
  const title = titleMatch ? plain(titleMatch[1]) : pageTitle(html);
  if (!title) return null;

  const authorMatch = /<div class="authi">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(html);
  const dateMatch = /<em id="authorposton\d+">发表于\s*([^<]*)<\/em>/i.exec(html);
  const forumMatch = /<a href="[^"]*forum-(\d+)-1\.html"[^>]*>([^<]*)<\/a>/i.exec(
    (html.match(/<div id="pt">[\s\S]*?<\/div>/) || [""])[0],
  );
  const coverMatch = /zoomfile="([^"]+)"/i.exec(html);

  let whole = "";
  if (coverMatch) whole = absolute(coverMatch[1]);

  /* The first post: from postmessage_ to the end of its block. Signatures and
     replies follow, so only a slice is read for the description. */
  let body = "";
  const bodyMatch = /id="postmessage_\d+"[^>]*>([\s\S]{0,12000})/i.exec(html);
  if (bodyMatch) {
    body = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<ignore_js_op>[\s\S]*?<\/ignore_js_op>/gi, " ")
      .replace(/<div class="tip[\s\S]*?<\/div>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n");
    body = decode(body.replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim();
  }

  /* Lines like 王菲《1994 天空》[APE 整轨] are the album list of the thread. */
  const albums = [];
  for (const line of body.split("\n")) {
    const found = /《([^》]{1,60})》/.exec(line);
    if (!found) continue;
    const name = found[1].trim();
    if (name && albums.indexOf(name) < 0) albums.push(name);
    if (albums.length >= 40) break;
  }

  const hidden = /查看本帖隐藏内容请回复/.test(body);
  const cleaned = body.replace(/游客，如果您要查看本帖隐藏内容请回复/gi, "").trim();

  return {
    id: String(tid),
    title: title,
    author: authorMatch ? plain(authorMatch[1]) : "",
    date: dateMatch ? decode(dateMatch[1]).trim() : "",
    forumId: forumMatch ? forumMatch[1] : "",
    forumName: forumMatch ? decode(forumMatch[2]).trim() : "",
    cover: whole,
    body: cleaned.slice(0, 300),
    albums: albums,
    hidden: hidden,
  };
}

/* ---------------------------------------------------------------- NetEase */

const searchCache = new Map();

async function fetchSearch(key) {
  return jsonp(
    METING + "?server=netease&type=search&id=" + encodeURIComponent(key) + "&r=" + Math.floor(Math.random() * 1e6),
    { timeout: 20000 },
  );
}

async function neteaseSearch(keyword) {
  const key = String(keyword || "").trim();
  if (!key) return [];
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.tracks;

  /* The Meting host answers in about three seconds and now and then stalls;
     one retry is cheaper than showing an empty album page. */
  let data = null;
  for (let attempt = 0; attempt < 2 && data === null; attempt += 1) {
    try {
      data = await fetchSearch(key);
    } catch (error) {
      if (attempt === 1) return [];
    }
  }
  if (!Array.isArray(data)) return [];

  const tracks = [];
  for (const item of data) {
    const songMatch = /[?&]id=(\d+)[^0-9]/.exec(item && item.url ? item.url : "");
    if (!songMatch) continue;
    const sid = songMatch[1];
    const track = {
      id: "n" + sid,
      name: decode(item.title || "").trim(),
      netease: sid,
    };
    const author = decode(item.artist || item.author || "").trim();
    if (author) track.artists = [{ name: author }];
    if (!track.name) continue;
    tracks.push(track);
  }

  searchCache.set(key, { at: Date.now(), tracks: tracks });
  return tracks;
}

/* Turns a thread title into something NetEase can answer. "收藏极品 王菲全部
   专辑合集1985-2012 无损专辑下载" has no album name, so the format words and
   the tail are dropped and the singer is what is left. */
const FORMAT_WORDS =
  /(无损|FLAC|flac|APE|ape|WAV|wav|DSD|dsd|Hi-?Res|hi-res|MP3|mp3|M4A|AAC|车载|超清|高清|专辑|合集|全集|合辑|完整版|全部|下载|网盘|百度云|夸克|试听|音频|音乐)/g;

function listenParts(title) {
  const text = String(title || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/【[^】]*】/g, " ")
    .replace(/（[^）]*）/g, " ");

  const albumMatch = /《([^》]{2,30})》/.exec(text);
  if (albumMatch) {
    const album = albumMatch[1].replace(FORMAT_WORDS, " ").replace(/\s+/g, " ").trim();
    const before = text.slice(0, albumMatch.index).replace(FORMAT_WORDS, " ").replace(/\s+/g, " ").trim();
    const singer = before.split(/\s+/).filter(Boolean).slice(-1)[0] || "";
    const safeSinger = singer.length <= 12 ? singer : "";
    return {
      album: album,
      singer: safeSinger,
      query: safeSinger || album,
    };
  }

  const clean = text
    .replace(FORMAT_WORDS, " ")
    .replace(/\d{4}[-~—至]\d{0,4}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean
    .split(/\s+/)
    .filter((word) => word && !/^(收藏|极品|推荐|经典|珍藏|绝版|首发|独家|重磅|试音|发烧|全部)/.test(word));
  const first = words[0] || "";
  const singer = first.length <= 8 ? first : "";
  return { album: words.slice(0, 3).join(" "), singer: singer, query: singer || words.slice(0, 3).join(" ") };
}

const previewCache = new Map();

async function preview(title, cover) {
  const cached = previewCache.get(title);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.tracks;

  const parts = listenParts(title);
  const tries = [parts.query, parts.album, parts.singer]
    .filter(Boolean)
    .filter((word, index, all) => all.indexOf(word) === index);

  let tracks = [];
  for (const word of tries) {
    try {
      tracks = await neteaseSearch(word);
    } catch (error) {
      tracks = [];
    }
    if (tracks.length) break;
  }

  /* A Meting search is fuzzy: "理性与感性作品音乐会" answers with Take Me Hand.
     When the thread names a singer, keep only what is by or about them; if that
     leaves nothing, the raw answer is still better than an empty album. */
  if (tracks.length && parts.singer) {
    const kept = tracks.filter((track) => {
      const author = (track.artists && track.artists[0] && track.artists[0].name) || "";
      return author.indexOf(parts.singer) >= 0 || track.name.indexOf(parts.singer) >= 0;
    });
    if (kept.length) tracks = kept;
  }

  tracks = tracks.slice(0, 12);
  if (cover) {
    for (const track of tracks) if (!track.imageUrl) track.imageUrl = cover;
  }
  previewCache.set(title, { at: Date.now(), tracks: tracks });
  return tracks;
}

/* ------------------------------------------------------------------ audio */

const mediaCache = new Map();

async function mediaUrl(sid) {
  const cached = mediaCache.get(sid);
  if (cached && Date.now() - cached.at < 2 * 60 * 1000) return cached.url;

  const res = await request(MEDIA + "?server=netease&type=url&id=" + encodeURIComponent(sid), {
    redirect: "manual",
    headers: { accept: "*/*", referer: "https://www.carsmp3.com/" },
  });

  let url = "";
  if (res.status >= 300 && res.status < 400) url = res.headers.get("location") || "";
  else if (res.ok) url = res.url || "";

  if (!url || !/^https?:/.test(url)) {
    throw fail("unavailable", t("这首在网易云没有公开试听，换一首或回站点下载"));
  }

  /* The mp3 on music.126.net answers ranged requests; a 200 with no audio type
     means the song is region or VIP locked even though the redirect happened. */
  const probe = await request(url, { headers: { range: "bytes=0-1023", accept: "*/*" } });
  const type = probe.headers.get("content-type") || "";
  if (probe.status >= 400 || !/audio|octet-stream|mp3|mpeg/.test(type)) {
    throw fail("unavailable", t("这首在网易云没有公开试听，换一首或回站点下载"));
  }
  mediaCache.set(sid, { at: Date.now(), url: url });
  return url;
}

export async function stream({ id }) {
  const key = String(id || "");
  const sid = key.indexOf("n") === 0 ? key.slice(1) : key;
  if (!/^\d+$/.test(sid)) throw fail("invalid", t("没有这个曲目"));
  return { url: await mediaUrl(sid), type: "mp3" };
}

export async function lyrics({ id }) {
  const key = String(id || "");
  const sid = key.indexOf("n") === 0 ? key.slice(1) : key;
  if (!/^\d+$/.test(sid)) return { lrc: "" };
  try {
    const res = await request(MEDIA + "?server=netease&type=lrc&id=" + encodeURIComponent(sid), {
      headers: { accept: "text/plain, */*" },
    });
    if (res.status >= 400) return { lrc: "" };
    const text = await res.text();
    if (!text || text.indexOf("[") !== 0) return { lrc: "" };
    return { lrc: text.trim() };
  } catch (error) {
    return { lrc: "" };
  }
}

/* ------------------------------------------------------------------ pages */

export async function home() {
  const html = await page("/");
  const blocks = portalBlocks(html);
  const sections = [];
  const covers = [];
  for (const block of blocks) {
    const first = block.items.filter((item) => item.name).slice(0, 1)[0];
    if (first) covers.push({ fid: block.fid, title: block.title, album: toAlbum(first) });
  }

  /* The portal shows one cover per board, which is too thin for a home screen,
     so two busy boards contribute their first page as well. */
  for (const fid of ["40", "43"]) {
    try {
      const board = await browse({ page: "forum/" + fid, limit: 10 });
      const list = board.sections[board.sections.length - 1];
      if (list && list.albums.length) {
        const cover = covers.find((item) => item.fid === fid);
        let albums = list.albums.slice(0, 10);
        if (cover) {
          albums = albums.filter((album) => album.id !== cover.album.id);
          albums.unshift(cover.album);
        }
        sections.push({ title: list.title, albums: albums.slice(0, 10), morePage: "forum/" + fid });
      }
    } catch (error) {
      /* a board page failing should not empty the home screen */
    }
  }

  for (const cover of covers) {
    if (sections.some((section) => section.morePage === "forum/" + cover.fid)) continue;
    if (sections.length >= 8) break;
    sections.push({ title: cover.title, albums: [cover.album], morePage: "forum/" + cover.fid });
  }

  if (!sections.length) {
    const fallback = await browse({ page: "forum/40" });
    sections.push({ title: fallback.title, albums: fallback.sections[0].albums, morePage: "forum/40" });
  }

  return { title: t("汽车音乐网"), sections: sections };
}

function splitPage(value) {
  const clean = String(value || "").replace(/^\/+|\/+$/g, "");
  const numbered = /^(.*?)\/(\d+)$/.exec(clean);
  if (numbered && /^(forum|board)\/\d+$/.test(numbered[1])) {
    return { base: numbered[1], page: parseInt(numbered[2], 10) || 1 };
  }
  return { base: clean, page: 1 };
}

export async function browse({ page: path, limit }) {
  const value = String(path || "home");
  const split = splitPage(value);

  const forum = /^(forum|board)\/(\d+)$/.exec(split.base);
  if (forum) {
    const fid = forum[2];
    const pageNo = Math.max(1, split.page || 1);
    const html = await page("/forum-" + fid + "-" + pageNo + ".html");
    const data = forumPage(html);
    if (!data.entries.length) throw fail("unavailable", t("这个版块没有内容"));
    const albums = data.entries
      .filter((entry) => !entry.sticky)
      .slice(0, limit || 20)
      .map((entry) => {
        const album = { id: entry.id, name: entry.name };
        if (entry.author) album.artists = [{ name: entry.author }];
        if (entry.date) album.description = entry.date + (entry.tag ? " · " + entry.tag : "");
        return album;
      });
    const sticky = data.entries.filter((entry) => entry.sticky).map(toAlbum);
    const sections = [];
    if (sticky.length) sections.push({ title: t("置顶"), albums: sticky.slice(0, 4) });
    sections.push({
      title: data.title || t("版块"),
      albums: albums,
      morePage: pageNo < data.totalPages ? "forum/" + fid + "/" + (pageNo + 1) : undefined,
    });
    return { title: data.title || t("版块"), sections: sections };
  }

  const thread = /^thread\/(\d+)$/.exec(split.base);
  if (thread) {
    const detail = await album({ id: thread[1] });
    const sections = [{ title: t("网易云试听"), tracks: detail.tracks }];
    if (!detail.tracks.length) {
      sections[0].title = t("没有找到试听");
    }
    return { title: detail.album.name, description: detail.album.description, sections: sections };
  }

  throw fail("unavailable", t("没有这个页面"));
}

/* A thread is the album: cover, description, the album list found in the post,
   and the NetEase matches that can actually be played. */
const threadCache = new Map();

async function thread(id) {
  const key = String(id || "");
  const cached = threadCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const html = await page("/thread-" + encodeURIComponent(key) + "-1-1.html");
  const data = threadPage(html, key);
  if (!data) throw fail("unavailable", t("没有这个页面"));
  threadCache.set(key, { at: Date.now(), data: data });
  return data;
}

export async function album({ id }) {
  const info = await thread(id);
  const tracks = await preview(info.title, info.cover);
  const singer = listenParts(info.title).singer;

  const lines = [];
  if (info.body) lines.push(info.body.split("\n")[0].slice(0, 120));
  if (info.albums.length) {
    lines.push(t("帖内专辑") + "（" + info.albums.length + "）：" + info.albums.slice(0, 6).join("、"));
  }
  if (info.hidden) lines.push(t("下载地址需登录并回复本帖后可见，插件不代下载。"));
  if (!tracks.length) lines.push(t("没有匹配到可试听的曲目，请回站点下载无损版。"));
  else lines.push(t("试听为按标题匹配的网易云曲目，不一定是帖内那张专辑。"));

  remember(tracks);

  return {
    album: {
      id: info.id,
      name: info.title,
      imageUrl: info.cover || undefined,
      artists: singer ? [{ name: singer }] : info.author ? [{ name: info.author }] : undefined,
      description: lines.join("\n"),
    },
    tracks: tracks,
  };
}

/* ---------------------------------------------------------------- search */

export async function search({ query, offset, kind }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));
  if (kind && kind !== "tracks") return { albums: [], more: false };
  const start = Math.max(0, Number(offset) || 0);
  if (start > 0) return { tracks: [], more: false };

  const tracks = await neteaseSearch(keyword);
  remember(tracks);
  return { tracks: tracks.slice(0, 30), more: false };
}

export function suggest({ query }) {
  const boards = [
    t("华语音乐"),
    t("外语音乐"),
    t("纯音乐"),
    t("DJ摇滚"),
    t("抖音歌曲"),
    t("Hi-Res"),
    t("车载MV"),
    t("无损"),
  ];
  const words = String(query || "").trim();
  if (!words) return boards;
  return boards.filter((item) => item.indexOf(words) >= 0);
}

export async function artist({ id }) {
  const raw = String(id || "");
  let name = raw.indexOf("a:") === 0 ? raw.slice(2) : raw;
  try {
    name = decodeURIComponent(name);
  } catch (error) {
    /* keep it as it came in */
  }
  name = name.trim();
  if (!name) throw fail("invalid", t("没有这个歌手"));
  const tracks = (await neteaseSearch(name)).slice(0, 30);
  remember(tracks);
  return {
    artist: {
      id: "a:" + name,
      name: name,
      imageUrl: tracks.length ? tracks[0].imageUrl : undefined,
    },
    tracks: tracks,
    albums: [],
  };
}

/* ------------------------------------------------------------------ library */

const index = host.storage.get("trackIndex") || {};

function remember(tracks) {
  let changed = false;
  for (const track of tracks) {
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
