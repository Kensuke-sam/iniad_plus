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

for path in manifest.json css js lib; do
  if [ ! -e "$path" ]; then
    echo "Missing required path: $path" >&2
    exit 1
  fi
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
PY

rm -f "$OUTPUT_ZIP"

(
  cd "$STAGE_DIR"
  zip -qr "$OUTPUT_ZIP" manifest.json css img js lib
)

echo "Created $OUTPUT_ZIP"
