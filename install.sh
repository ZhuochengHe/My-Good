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
fi

# Install default system prompts to ~/.my-agent/prompts/system-prompts/
PROMPTS_SRC="$SCRIPT_DIR/src/cli/prompts"
PROMPTS_TARGET="$HOME/.my-agent/prompts/system-prompts"

if [[ -d "$PROMPTS_SRC" ]]; then
  mkdir -p "$PROMPTS_TARGET"
  for prompt_file in "$PROMPTS_SRC"/system_*.md "$PROMPTS_SRC/soul.md"; do
    [[ -f "$prompt_file" ]] || continue
    target_file="$PROMPTS_TARGET/$(basename "$prompt_file")"
    # Never overwrite soul.md — it's the agent's own evolving file
    if [[ "$(basename "$prompt_file")" == "soul.md" && -f "$target_file" ]]; then
      echo "✓ soul.md already exists, skipping (keeping your version)"
    else
      cp "$prompt_file" "$target_file"
      echo "✓ prompt installed: $(basename "$prompt_file") → $target_file"
    fi
  done
  # Install planning sub-modules
  if [[ -d "$PROMPTS_SRC/planning" ]]; then
    mkdir -p "$PROMPTS_TARGET/planning"
    for prompt_file in "$PROMPTS_SRC/planning"/planning_*.md; do
      [[ -f "$prompt_file" ]] || continue
      cp "$prompt_file" "$PROMPTS_TARGET/planning/$(basename "$prompt_file")"
      echo "✓ planning prompt installed: $(basename "$prompt_file") → $PROMPTS_TARGET/planning/"
    done
  fi
fi

# Install compact prompts to ~/.my-agent/prompts/compact/
COMPACT_TARGET="$HOME/.my-agent/prompts/compact"

if [[ -d "$PROMPTS_SRC" ]]; then
  mkdir -p "$COMPACT_TARGET"
  for prompt_file in "$PROMPTS_SRC"/compact_*.md; do
    [[ -f "$prompt_file" ]] || continue
    cp "$prompt_file" "$COMPACT_TARGET/$(basename "$prompt_file")"
    echo "✓ compact prompt installed: $(basename "$prompt_file") → $COMPACT_TARGET"
  done
fi

echo ""
echo "Run: my-agent setup"
echo ""
echo "Note: persistent memory requires an OpenAI API key (used for gpt-4o-mini consolidation"
echo "      and text-embedding-3-small search). Configure via: my-agent setup"
