// 补齐 locales：从 index.js 抓出所有 t("…") 的原文，生成
//   locales/zh-CN.json   原文 → 原文（中文界面固定用这套词）
//   locales/en.json      原文 → 原文（没做英文翻译时的恒等映射，
//                        挡住宿主自动机翻把术语翻乱；要英文请逐条替换）
//
//   node scripts/locales.mjs          只补缺失的
//   node scripts/locales.mjs --check  只报告谁缺 locales
//
// 已存在的文件不覆盖，避免抹掉人手写好的翻译。

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const checkOnly = process.argv.includes("--check");

function stringsOf(source) {
  const found = new Set();
  const re = /\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\)/g;
  let match;
  while ((match = re.exec(source))) {
    const raw = match[1].slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    if (raw.trim()) found.add(raw);
  }
  return Array.from(found);
}

let made = 0;
let ok = 0;
const missing = [];
const onlyZh = [];

for (const name of readdirSync(join(root, "plugins"))) {
  const dir = join(root, "plugins", name);
  if (!existsSync(join(dir, "plugin.json"))) continue;

  const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));
  const localeDir = join(dir, "locales");
  const zh = join(localeDir, "zh-CN.json");
  const en = join(localeDir, "en.json");

  /* 以 zh-CN.json 是否存在作为“已配置”判据：有了它就锁定中文说法，
     en.json 只是可选补充，不强行生成一堆恒等的假翻译。 */
  if (existsSync(zh)) {
    ok += 1;
    if (!existsSync(en)) onlyZh.push(manifest.id);
    continue;
  }

  missing.push(manifest.id);
  if (checkOnly) continue;

  const source = readFileSync(join(dir, "index.js"), "utf8");
  const keys = stringsOf(source);
  if (manifest.name) keys.unshift(manifest.name);
  if (manifest.description) keys.push(manifest.description);

  const table = {};
  for (const key of keys) table[key] = key;

  mkdirSync(localeDir, { recursive: true });
  if (!existsSync(zh)) writeFileSync(zh, JSON.stringify(table, null, 2) + "\n", "utf8");
  if (!existsSync(en)) writeFileSync(en, JSON.stringify(table, null, 2) + "\n", "utf8");

  console.log(manifest.id + (existsSync(zh) && existsSync(en) ? "" : "  补齐 " + keys.length + " 条"));
  made += 1;
}

console.log("");
if (checkOnly) {
  console.log("有 zh-CN " + ok + " 个，完全没有 locales " + missing.length + " 个" + (missing.length ? "：" + missing.join("、") : ""));
  if (onlyZh.length) console.log("只有 zh-CN、没 en.json " + onlyZh.length + " 个（英文界面显示中文原文）：" + onlyZh.join("、"));
  process.exit(missing.length ? 2 : 0);
} else {
  console.log("已有 zh-CN " + ok + " 个，本次补齐 " + made + " 个" + (onlyZh.length ? "（另有 " + onlyZh.length + " 个只有 zh-CN，未动）" : ""));
}
