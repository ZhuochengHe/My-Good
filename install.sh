#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_TARGET="$HOME/.local/bin/my-agent"

echo "Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

echo "Building my-agent..."
npm run build

echo "Installing to $BIN_TARGET..."
mkdir -p "$HOME/.local/bin"
rm -f "$BIN_TARGET"
ln -sf "$SCRIPT_DIR/bin/my-agent" "$BIN_TARGET"
chmod +x "$SCRIPT_DIR/bin/my-agent"

echo ""
echo "✓ my-agent installed → $BIN_TARGET"

# Install built-in plugins to ~/.my-agent/plugins/
PLUGINS_SRC="$SCRIPT_DIR/plugins"
PLUGINS_TARGET="$HOME/.my-agent/plugins"

if [[ -d "$PLUGINS_SRC" ]]; then
  mkdir -p "$PLUGINS_TARGET"
  for plugin_src in "$PLUGINS_SRC"/*/; do
    plugin_name="$(basename "$plugin_src")"
    target_dir="$PLUGINS_TARGET/$plugin_name"
    mkdir -p "$target_dir"
    cp "$plugin_src"* "$target_dir/"
    echo "✓ plugin installed: $plugin_name → $target_dir"
  done
fi

# Detect the current shell and its rc file
CURRENT_SHELL="$(basename "${SHELL:-}")"
case "$CURRENT_SHELL" in
  zsh)  SHELL_RC="$HOME/.zshrc" ;;
  bash) SHELL_RC="${HOME}/.bash_profile"
        [[ -f "$HOME/.bashrc" ]] && SHELL_RC="$HOME/.bashrc" ;;
  fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
  *)    SHELL_RC="" ;;
esac

# Check that ~/.local/bin is on PATH in the active shell's rc file
if [[ -n "$SHELL_RC" && -f "$SHELL_RC" ]]; then
  if grep -q '\.local/bin' "$SHELL_RC"; then
    echo "✓ ~/.local/bin is already in PATH ($SHELL_RC)"
  else
    echo ""
    echo "⚠  ~/.local/bin is not in PATH ($SHELL_RC)"
    read -r -p "   Add it now? [y/N] " answer
    if [[ "${answer,,}" == "y" ]]; then
      echo '' >> "$SHELL_RC"
      echo '# Added by my-agent install' >> "$SHELL_RC"
      echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
      echo "✓ Added to $SHELL_RC — run: source $SHELL_RC"
    else
      echo "   Skipped. Add manually: export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
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
echo ""
echo "Note: persistent memory requires an OpenAI API key (used for gpt-4o-mini consolidation"
echo "      and text-embedding-3-small search). Configure via: my-agent setup"
