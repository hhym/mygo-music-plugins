#!/usr/bin/env bash
# 统一打包：每个插件从 plugins/<dir>/ 一次性产出两个包
#   dist/<id>-<版本>.zip           ASCII 名（标准命名），随 main 分支更新
#   release/<id>-<版本>.zip        ASCII 名，用于 GitHub Releases
#
# dist 包名统一用插件 id（小写、连字符、纯 ASCII），中文显示名只写在
# plugin.json 的 name、各插件 README.md 和 index.js 首行注释里，不进文件名。
#
# 版本与文件名都从 plugin.json 读，不手写、不猜；locales/ 存在时一并打进去，
# 避免再出现 dist 里的包落后于插件目录（如 yuetingba 0.1.0 vs 插件 0.1.3）。
#
# 用法：
#   ./scripts/pack.sh                 全部重打
#   ./scripts/pack.sh <id>            只重打一个插件
#   ./scripts/pack.sh --check         只检查：dist 是否缺失、包内版本是否与源码一致
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

NODE_BIN="${NODE:-node}"
CHECK=0
ONLY=""
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    -*) echo "未知参数 $arg"; exit 1 ;;
    *) ONLY="$arg" ;;
  esac
done

[ "$CHECK" = 1 ] || mkdir -p dist release

read_meta() {
  "$NODE_BIN" -e '
    const m = require("./'"$1"'/plugin.json");
    if (!m.id || !m.name || !m.version) { console.error("清单缺字段: '"$1"'"); process.exit(1); }
    console.log([m.id, m.name, m.version].join("\t"));
  '
}

zip_version() {
  unzip -p "$1" plugin.json 2>/dev/null | "$NODE_BIN" -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try { const m = JSON.parse(raw); console.log((m.id || "") + "\t" + (m.version || "")); }
      catch (error) { console.log("\t"); }
    });
  '
}

count=0
stale=0
missing=0

for dir in plugins/*/; do
  dir="${dir%/}"
  [ -f "$dir/plugin.json" ] || continue
  [ -f "$dir/index.js" ] || { echo "skip $dir（没有 index.js）"; continue; }

  meta=$(read_meta "$dir") || exit 1
  id=$(printf '%s' "$meta" | cut -f1)
  name=$(printf '%s' "$meta" | cut -f2)
  version=$(printf '%s' "$meta" | cut -f3)

  [ -z "$ONLY" ] || [ "$ONLY" = "$id" ] || continue

  chinese="dist/$id-$version.zip"
  ascii="release/$id-$version.zip"

  if [ "$CHECK" = 1 ]; then
    if [ ! -f "$ROOT/$chinese" ]; then
      echo "缺失  $id v$version → dist/$id-$version.zip"
      missing=$((missing + 1))
    else
      packed=$(zip_version "$ROOT/$chinese")
      packed_id=$(printf '%s' "$packed" | cut -f1)
      packed_ver=$(printf '%s' "$packed" | cut -f2)
      if [ "$packed_id" != "$id" ] || [ "$packed_ver" != "$version" ]; then
        echo "过期  $id v$version → 包内是 ${packed_id:-空} v${packed_ver:-空}"
        stale=$((stale + 1))
      fi
    fi
    count=$((count + 1))
    continue
  fi

  files=(plugin.json index.js README.md)
  [ -d "$dir/locales" ] && files+=(locales)

  rm -f "$ROOT/$ascii" "$ROOT/$chinese"
  ( cd "$dir" && zip -q -r -X "$ROOT/$ascii" "${files[@]}" )
  cp "$ROOT/$ascii" "$ROOT/$chinese"

  echo "$(printf '%-24s' "$id") $version  ($name)  →  dist/$id-$version.zip"
  count=$((count + 1))
done

echo
if [ "$CHECK" = 1 ]; then
  echo "检查 $count 个插件：缺失 $missing，过期 $stale"
  [ $((missing + stale)) -eq 0 ] || exit 2
else
  echo "共 $count 个插件：dist/<id>-<版本>.zip + release/<id>-<版本>.zip（均 ASCII 命名，带版本号）"
fi
