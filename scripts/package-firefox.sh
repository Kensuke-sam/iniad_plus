#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/firefox-package"
cd "$ROOT_DIR"

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path

manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
print(manifest["version"])
PY
)"
OUTPUT_ZIP="$DIST_DIR/iniad_plus-firefox-addons-v${VERSION}.zip"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$DIST_DIR"

for path in manifest.json css js lib firefox LICENSE THIRD_PARTY_NOTICES.md; do
  if [ ! -e "$path" ]; then
    echo "Missing required path: $path" >&2
    exit 1
  fi
  cp -R "$path" "$STAGE_DIR/$path"
done

rm -f "$STAGE_DIR/js/service-worker.js"

mkdir -p "$STAGE_DIR/img"
python3 - "$ROOT_DIR" "$STAGE_DIR" <<'PY'
import json
import shutil
import sys
from pathlib import Path

root = Path(sys.argv[1])
stage = Path(sys.argv[2])
manifest_path = stage / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

manifest["name"] = "INIAD Plus - MOOCs PDF Helper"
manifest["description"] = "INIAD MOOCs の認可済み講義スライドを学習用 PDF として保存しやすくする非公式 Firefox 拡張です"
manifest["permissions"] = [
    permission
    for permission in manifest.get("permissions", [])
    if permission not in ("debugger", "storage")
]
if not manifest["permissions"]:
    manifest.pop("permissions", None)
manifest.pop("optional_permissions", None)
manifest["background"] = {
    "scripts": ["firefox/background.js"]
}
manifest["browser_specific_settings"] = {
    "gecko": {
        "id": "iniad-plus@kensuke-sam.github.io",
        "data_collection_permissions": {
            "required": ["none"]
        },
        "strict_min_version": "121.0"
    }
}

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

manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)
PY

rm -f "$OUTPUT_ZIP"

(
  cd "$STAGE_DIR"
  zip -qr "$OUTPUT_ZIP" manifest.json LICENSE THIRD_PARTY_NOTICES.md css firefox img js lib
)

echo "Created $OUTPUT_ZIP"
