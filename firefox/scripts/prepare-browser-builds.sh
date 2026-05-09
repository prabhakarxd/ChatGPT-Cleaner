#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
CHROME_DIR="$BUILD_DIR/chrome"
FIREFOX_DIR="$BUILD_DIR/firefox"

rm -rf "$CHROME_DIR" "$FIREFOX_DIR"
mkdir -p "$CHROME_DIR" "$FIREFOX_DIR"

copy_common_files() {
  local target_dir="$1"
  cp -R "$ROOT_DIR/assets" "$target_dir/assets"
  cp -R "$ROOT_DIR/popup" "$target_dir/popup"
  cp -R "$ROOT_DIR/scripts" "$target_dir/scripts"
  cp -R "$ROOT_DIR/styles" "$target_dir/styles"
  cp "$ROOT_DIR/README.md" "$target_dir/README.md"
}

copy_common_files "$CHROME_DIR"
copy_common_files "$FIREFOX_DIR"

cp "$ROOT_DIR/manifest.json" "$CHROME_DIR/manifest.json"

cat > "$FIREFOX_DIR/manifest.json" <<'EOF'
{
  "manifest_version": 3,
  "name": "ChatGPT Cleaner",
  "version": "1.0.0",
  "description": "Scan, filter, back up, and bulk delete ChatGPT conversations with a resilient queue-based workflow.",
  "permissions": [
    "scripting",
    "storage",
    "downloads",
    "notifications",
    "tabs"
  ],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://chat.com/*"
  ],
  "background": {
    "scripts": [
      "scripts/utils.js",
      "scripts/state.js",
      "scripts/storage.js",
      "scripts/background.js"
    ]
  },
  "action": {
    "default_title": "ChatGPT Cleaner",
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icons/icon-16.png",
      "32": "assets/icons/icon-32.png",
      "48": "assets/icons/icon-48.png"
    }
  },
  "icons": {
    "16": "assets/icons/icon-16.png",
    "32": "assets/icons/icon-32.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  },
  "content_scripts": [
    {
      "matches": [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://chat.com/*"
      ],
      "css": [
        "styles/shared.css"
      ],
      "js": [
        "scripts/utils.js",
        "scripts/state.js",
        "scripts/storage.js",
        "scripts/logger.js",
        "scripts/selectors.js",
        "scripts/filters.js",
        "scripts/queue.js",
        "scripts/export.js",
        "scripts/api.js",
        "scripts/observer.js",
        "scripts/deletion.js",
        "scripts/content.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "browser_specific_settings": {
    "gecko": {
      "id": "chatgpt-cleaner@example.com",
      "data_collection_permissions": {
        "required": [
          "none"
        ]
      },
      "strict_min_version": "121.0"
    }
  }
}
EOF

printf 'Prepared browser builds:\n- %s\n- %s\n' "$CHROME_DIR" "$FIREFOX_DIR"
