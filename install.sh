#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_TARGET="$HOME/.local/bin/my-agent"

echo "Building my-agent..."
cd "$SCRIPT_DIR"
npm run build

echo "Installing to $BIN_TARGET..."
mkdir -p "$HOME/.local/bin"
rm -f "$BIN_TARGET"
ln -sf "$SCRIPT_DIR/bin/my-agent" "$BIN_TARGET"
chmod +x "$SCRIPT_DIR/bin/my-agent"

echo ""
echo "✓ my-agent installed → $BIN_TARGET"

# Check that ~/.local/bin is on PATH in the shells the user has configured
SHELLS_MISSING_PATH=()
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
  if [[ -f "$rc" ]] && ! grep -q '\.local/bin' "$rc"; then
    SHELLS_MISSING_PATH+=("$rc")
  fi
done

if [[ ${#SHELLS_MISSING_PATH[@]} -gt 0 ]]; then
  echo ""
  echo "⚠  Add ~/.local/bin to PATH in: ${SHELLS_MISSING_PATH[*]}"
  echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
else
  echo "✓ ~/.local/bin is already in PATH"
fi

echo ""
echo "Run: my-agent setup"
