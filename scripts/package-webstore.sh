#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/webstore-package"
cd "$ROOT_DIR"

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path

manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
print(manifest["version"])
PY
)"
OUTPUT_ZIP="$DIST_DIR/iniad_plus-chrome-web-store-v${VERSION}.zip"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$DIST_DIR"

for path in manifest.json css/download-button.css css/moocs_assignment_tabs.css js/download-button.js js/download.js js/moocs_assignment_tabs.js lib/jquery-3.7.1.min.js LICENSE THIRD_PARTY_NOTICES.md; do
  if [ ! -e "$path" ]; then
    echo "Missing required path: $path" >&2
    exit 1
  fi
  mkdir -p "$STAGE_DIR/$(dirname "$path")"
  cp -R "$path" "$STAGE_DIR/$path"
done

mkdir -p "$STAGE_DIR/img"
python3 - "$ROOT_DIR" "$STAGE_DIR" <<'PY'
import json
import shutil
import sys
from pathlib import Path

root = Path(sys.argv[1])
stage = Path(sys.argv[2])
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))

icon_paths = sorted(set(manifest.get("icons", {}).values()))
if not icon_paths:
    raise SystemExit("No icons defined in manifest.json")

for rel_path in icon_paths:
    src = root / rel_path
    dst = stage / rel_path
    if not src.exists():
        raise SystemExit(f"Missing required icon: {rel_path}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

manifest["name"] = "INIAD Plus - MOOCs PDF Helper"
manifest["short_name"] = "INIAD Plus"
manifest["description"] = "INIAD MOOCs の講義スライドの学習用 PDF 作成と、課題・出席ページの確認を補助する非公式 Chrome 拡張です"
for key in ("permissions", "optional_permissions", "background"):
    manifest.pop(key, None)
manifest["content_scripts"] = [
    {
        "matches": ["https://moocs.iniad.org/*"],
        "js": [
            "lib/jquery-3.7.1.min.js",
            "js/download-button.js",
            "js/moocs_assignment_tabs.js"
        ],
        "css": [
            "css/download-button.css",
            "css/moocs_assignment_tabs.css"
        ]
    },
    {
        "matches": ["https://docs.google.com/presentation/d/e/*"],
        "js": [
            "lib/jquery-3.7.1.min.js",
            "js/download.js"
        ]
    }
]

(stage / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)
PY

rm -f "$OUTPUT_ZIP"

(
  cd "$STAGE_DIR"
  zip -qr "$OUTPUT_ZIP" manifest.json LICENSE THIRD_PARTY_NOTICES.md css img js lib
)

echo "Created $OUTPUT_ZIP"
