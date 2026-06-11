#!/usr/bin/env bash
# =============================================================
# NyaTicketTools - Setup Script
# =============================================================
# One-command setup: clone biliTickerBuy, install deps, init configs.
#
# Usage:
#   ./nyaticket setup            # Full setup
#   ./nyaticket setup --quick    # Only install deps, skip git clone
# =============================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}▶${NC}  $*"; }
ok()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
err()   { echo -e "${RED}✗${NC}  $*"; }
section() {
    echo
    echo -e "${CYAN}── $* ──${NC}"
}

# ── Paths ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TOOLS_DIR="$PROJECT_ROOT/tools"
CONFIG_DIR="$PROJECT_ROOT/config"
BTB_DIR="$TOOLS_DIR/biliTickerBuy"
BTB_REPO="https://github.com/mikumifa/biliTickerBuy.git"

# ── Parse arguments ───────────────────────────────────────────
QUICK_MODE=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --quick) QUICK_MODE=true; shift ;;
        -h|--help)
            echo "Usage: $0 [--quick]"
            echo "  --quick  Skip git clone, only install deps"
            exit 0 ;;
        *) err "Unknown: $1"; exit 1 ;;
    esac
done

# ── Header ────────────────────────────────────────────────────
echo -e "\n${MAGENTA}  NyaTicketTools Setup${NC}\n"

# ── Prereq: find Python ───────────────────────────────────────
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PYTHON="$cmd"
        break
    fi
done
if [[ -z "$PYTHON" ]]; then
    err "Python 3 not found. Install: apt install python3"
    exit 1
fi
ok "Python: $PYTHON ($($PYTHON --version 2>&1))"

# ── Prereq: find package manager (uv > pip3 > pip) ────────────
PKG_CMD=""
_has_uv() { command -v uv &>/dev/null; }

# uv installs to ~/.local/bin — add to PATH if not found
if ! _has_uv; then
    for d in "${HOME:-}/.local/bin" "${HOME:-}/.cargo/bin"; do
        [[ -x "$d/uv" ]] && { export PATH="$d:$PATH"; break; }
    done 2>/dev/null || true
fi

if _has_uv; then
    ok "Package manager: uv ($(uv --version 2>&1))"
    PKG_CMD="uv"
elif command -v pip3 &>/dev/null; then
    ok "Package manager: pip3"
    PKG_CMD="pip3"
elif command -v pip &>/dev/null; then
    ok "Package manager: pip"
    PKG_CMD="pip"
else
    err "No package manager found."
    echo "  Install uv (fastest):"
    echo "    curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "  Or pip:"
    echo "    apt install python3-pip"
    exit 1
fi

# Unified install helper
_pip_install() {
    if [[ "$PKG_CMD" == "uv" ]]; then
        uv pip install --system "$@" 2>&1
    else
        "$PKG_CMD" install "$@" 2>&1
    fi
}

# ── Prereq: git ───────────────────────────────────────────────
if ! command -v git &>/dev/null; then
    err "git not found. Install: apt install git"
    exit 1
fi
ok "Git: $(git --version 2>&1)"

# ── Install PyYAML (needed by scripts) ────────────────────────
section "Installing PyYAML"
info "Installing pyyaml..."
if _pip_install pyyaml --quiet; then
    ok "pyyaml installed"
else
    warn "pyyaml install failed (optional for Dashboard)"
fi

# ── Clone biliTickerBuy ───────────────────────────────────────
if [[ "$QUICK_MODE" == false ]]; then
    section "biliTickerBuy"
    if [[ -d "$BTB_DIR/.git" ]]; then
        info "Updating biliTickerBuy..."
        if (cd "$BTB_DIR" && git pull --rebase --quiet 2>&1); then
            ok "biliTickerBuy up to date"
        else
            warn "Update failed — continuing with current version"
        fi
    else
        info "Cloning biliTickerBuy..."
        if git clone --depth 1 "$BTB_REPO" "$BTB_DIR" 2>&1; then
            ok "biliTickerBuy cloned"
        else
            err "Clone failed — check network"
            exit 1
        fi
    fi
fi

# ── Install biliTickerBuy dependencies ────────────────────────
section "Installing biliTickerBuy dependencies"
info "This may take a minute on first run..."

if [[ -f "$BTB_DIR/requirements.txt" ]]; then
    if _pip_install -r "$BTB_DIR/requirements.txt" --quiet; then
        ok "Dependencies installed"
    else
        warn "Some deps may have failed — trying alternate method..."
    fi
fi

# Also try installing the package itself (handles the CLI entry point)
info "Installing biliTickerBuy package..."
if _pip_install "$BTB_DIR/" --quiet; then
    ok "biliTickerBuy package installed"
else
    warn "Package install failed — btb CLI may not be available"
    warn "You can still use: python3 -m biliTickerBuy buy config.json"
fi

# ── Verify installation ───────────────────────────────────────
section "Verifying"
if "$PYTHON" -c "import biliTickerBuy" 2>/dev/null; then
    ok "biliTickerBuy import OK"
else
    warn "biliTickerBuy import FAILED — check install"
    info "Try manually: $PKG_CMD install bilitickerbuy"
fi

# ── Create config files ───────────────────────────────────────
section "Config files"
for f in accounts tickets machines; do
    sample="$CONFIG_DIR/sample_${f}.yaml"
    target="$CONFIG_DIR/${f}.yaml"
    if [[ -f "$sample" ]]; then
        if [[ ! -f "$target" ]]; then
            cp "$sample" "$target"
            ok "Created config/${f}.yaml"
        else
            ok "config/${f}.yaml exists"
        fi
    fi
done

# ── Done ──────────────────────────────────────────────────────
echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "  ${BOLD}Next:${NC}"
echo -e "    ${CYAN}./nyaticket start${NC}"
echo -e "    Open ${CYAN}http://localhost:8090${NC}"
echo -e "    Add accounts + tickets in the Dashboard"
echo
