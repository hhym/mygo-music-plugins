// 批量回归探测：逐个插件跑 probe-one.mjs，汇总成一张表。
//
//   node scripts/probe.mjs                 探测全部插件
//   node scripts/probe.mjs 36dj-music      只探一个
//   node scripts/probe.mjs --json          机器可读，便于比对两次结果
//
// 判读要点（重要）：
//   200/206  → 可播
//   403/503  → 站点对当前出口拒绝，不代表插件坏了（云主机 / 海外 CI 常见）
//   404      → 多半是站点改版或曲目下架，需要看插件
//   超时     → 站点慢或不可达，换网络再测
// 所以本脚本退出码只反映“有没有插件加载/执行崩掉”，不把 403/503 当失败。

import { execFile } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.find((item) => !item.startsWith("-"));

function pluginDirs() {
  const base = join(root, "plugins");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => existsSync(join(base, name, "plugin.json")))
    .map((name) => join(base, name))
    .filter((dir) => !only || dir.endsWith("/" + only));
}

function runOne(dir) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(here, "probe-one.mjs"), dir],
      { timeout: 90000, maxBuffer: 1 << 20 },
      (error, stdout) => {
        const line = (stdout || "").trim().split("\n").pop();
        if (line && line.startsWith("{")) {
          try {
            resolve(JSON.parse(line));
            return;
          } catch (parseError) {
            /* fall through to the failure record */
          }
        }
        resolve({
          id: dir.split("/").pop(),
          name: dir.split("/").pop(),
          version: "?",
          home: "崩溃",
          track: "",
          stream: "",
          verify: "",
          ms: 0,
          note: error && error.killed ? "超时 90s" : "子进程未产出结果",
        });
      },
    );
  });
}

function verdict(row) {
  const verify = row.verify || "";
  if (verify.startsWith("206") || verify.startsWith("200")) return "可播";
  if (verify.startsWith("403") || verify.startsWith("503")) return "出口被拒";
  if (verify.startsWith("404")) return "404，需看";
  if (verify.includes("超时") || verify.includes("取不到")) return "无法验证";
  if (row.stream === "失败") return "stream 报错";
  if (row.stream === "空地址") return "空地址";
  if (row.home === "加载失败" || row.home === "崩溃") return "崩溃";
  return "未播放";
}

const dirs = pluginDirs();
if (!dirs.length) {
  console.error(only ? "找不到插件 " + only : "plugins/ 下没有插件");
  process.exit(1);
}

const rows = [];
for (const dir of dirs) rows.push(await runOne(dir));

const tally = {};
for (const row of rows) {
  const key = verdict(row);
  tally[key] = (tally[key] || 0) + 1;
}

if (asJson) {
  console.log(JSON.stringify({ at: new Date().toISOString(), tally: tally, rows: rows }, null, 2));
} else {
  const pad = (text, width) => {
    const value = String(text == null ? "" : text);
    return value + " ".repeat(Math.max(0, width - value.length));
  };
  console.log("| 插件 | 版本 | 首页 | stream | 地址验证 | 结论 | ms |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    console.log(
      "| " + pad(row.name, 14) + " | " + row.version + " | " + pad(row.home, 10) + " | " +
        pad(row.stream, 12) + " | " + pad(row.verify || "-", 22) + " | " + pad(verdict(row), 10) + " | " + row.ms + " |",
    );
  }
  console.log("");
  console.log("合计 " + rows.length + " 个：" + Object.keys(tally).map((key) => key + " " + tally[key]).join("，"));
  for (const row of rows) {
    if (row.note) console.log("- " + row.id + "：" + row.note);
  }
}

const crashed = rows.filter((row) => row.home === "崩溃" || row.home === "加载失败");
process.exit(crashed.length ? 1 : 0);
