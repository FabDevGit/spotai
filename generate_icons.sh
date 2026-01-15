#!/bin/bash
# Generate icons from logo.png
# Usage: ./generate_icons.sh /path/to/logo.png

LOGO="${1:-../macos/logo.png}"
ICONS_DIR="$(dirname "$0")/icons"

if [ ! -f "$LOGO" ]; then
    echo "Logo not found: $LOGO"
    echo "Usage: ./generate_icons.sh /path/to/logo.png"
    exit 1
fi

mkdir -p "$ICONS_DIR"

# Generate different sizes
sips -z 16 16 "$LOGO" --out "$ICONS_DIR/icon16.png" > /dev/null 2>&1
sips -z 48 48 "$LOGO" --out "$ICONS_DIR/icon48.png" > /dev/null 2>&1
sips -z 128 128 "$LOGO" --out "$ICONS_DIR/icon128.png" > /dev/null 2>&1

echo "Icons generated in $ICONS_DIR"
ls -la "$ICONS_DIR"
