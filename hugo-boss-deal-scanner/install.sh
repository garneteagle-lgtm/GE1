#!/bin/bash
# One-time setup for the Hugo Boss Deal Scanner on macOS.
#   1. Creates a private Python environment in this folder
#   2. Installs Playwright + a Chromium browser for scanning
#   3. Puts "Hugo Boss Deals.app" in ~/Applications (find it with Spotlight)
set -euo pipefail

cd "$(dirname "$0")"
DIR="$(pwd)"
APP_NAME="Hugo Boss Deals"
APP="$HOME/Applications/$APP_NAME.app"

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 9))' 2>/dev/null; then
  echo "Python 3.9+ is required. Install it from https://www.python.org/downloads/ (or: brew install python), then re-run this script."
  exit 1
fi

echo "==> Creating Python environment…"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt

echo "==> Downloading the scanning browser (about 150 MB, one time)…"
.venv/bin/python -m playwright install chromium

echo "==> Building $APP_NAME.app…"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/MacOS/launcher" <<EOF
#!/bin/bash
cd "$DIR"
exec "$DIR/.venv/bin/python" "$DIR/app.py"
EOF
chmod +x "$APP/Contents/MacOS/launcher"

cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>local.hugoboss-deal-scanner</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF

# Simple icon: a black tile with a white "B", rendered with built-in macOS tools.
if command -v sips >/dev/null && command -v iconutil >/dev/null; then
  TMP="$(mktemp -d)"
  cat > "$TMP/icon.svg" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect x="64" y="64" width="896" height="896" rx="200" fill="#111"/>
  <text x="512" y="700" font-family="Helvetica Neue, Helvetica, Arial" font-weight="bold"
        font-size="560" fill="#fff" text-anchor="middle">B</text>
</svg>
EOF
  if qlmanage -t -s 1024 -o "$TMP" "$TMP/icon.svg" >/dev/null 2>&1 && [ -f "$TMP/icon.svg.png" ]; then
    mkdir -p "$TMP/AppIcon.iconset"
    for s in 16 32 128 256 512; do
      sips -z $s $s "$TMP/icon.svg.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
      sips -z $((s*2)) $((s*2)) "$TMP/icon.svg.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
    done
    iconutil -c icns "$TMP/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns" || true
  fi
  rm -rf "$TMP"
fi
touch "$APP"

echo
echo "Done! Open \"$APP_NAME\" from Spotlight (⌘-Space) or ~/Applications."
echo "Tip: drag it from ~/Applications to your Dock for one-click access."
open -R "$APP" 2>/dev/null || true
