#!/usr/bin/env bash
# =============================================================
# NyaTickerTools - Initial Setup Script
# =============================================================
# Sets up a new machine for NyaTickerTools:
#   - Creates tools/ directory
#   - Clones all 4 tool repos
#   - Installs Python deps for biliTickerBuy and BHYG
#   - Downloads bili-ticket-go binary for current platform
#   - Optionally builds bili_ticket_rush (if Rust is installed)
#
# Usage:
#   ./scripts/setup.sh           # Full setup
#   ./scripts/setup.sh --quick   # Quick: only install deps (skip clones)
# =============================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
err()   { echo -e "${RED}✗${NC}  $*"; }
section() {
    echo
    echo -e "${CYAN}────────────────────────────────────────────${NC}"
    echo -e "${CYAN}  $*${NC}"
    echo -e "${CYAN}────────────────────────────────────────────${NC}"
}

# ── Paths ─────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TOOLS_DIR="$PROJECT_ROOT/tools"

# Tool repos
BTB_REPO="https://github.com/mikumifa/biliTickerBuy.git"
BHYG_REPO="https://github.com/ZianTT/BHYG.git"
RUSH_REPO="https://github.com/Violiate/bili_ticket_rush.git"
BTG_REPO="https://github.com/konaxia548/bili-ticket-go.git"

# ── Parse arguments ───────────────────────────────────────────

QUICK_MODE=false
STATUS_MODE=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --status)
            STATUS_MODE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--quick] [--status]"
            echo ""
            echo "Options:"
            echo "  --quick    Quick mode: only install deps, skip git clones"
            echo "  --status   Check tool versions and update availability"
            echo "  -h         Show this help"
            exit 0
            ;;
        *)
            err "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# ── Status check mode ─────────────────────────────────────────

if [[ "$STATUS_MODE" == true ]]; then
    echo -e "\n${MAGENTA}"
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║   NyaTickerTools - Tool Status           ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo -e "${NC}\n"

    for tool in biliTickerBuy BHYG bili_ticket_rush bili-ticket-go; do
        dir="$TOOLS_DIR/$tool"
        if [[ -d "$dir/.git" ]]; then
            local_hash=$(git -C "$dir" log -1 --format=%h 2>/dev/null || echo "unknown")
            remote_hash=$(git -C "$dir" ls-remote origin HEAD 2>/dev/null | awk '{print substr($1,1,7)}' || echo "unknown")
            if [[ "$local_hash" == "$remote_hash" ]]; then
                ok "$tool: $local_hash (up to date)"
            else
                warn "$tool: $local_hash (update available: $remote_hash)"
            fi
        elif [[ -d "$dir" ]]; then
            warn "$tool: directory exists but not a git repo"
        else
            err "$tool: not installed"
        fi
    done
    echo
    exit 0
fi

# ── Platform detection ────────────────────────────────────────

detect_platform() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$os" in
        linux)
            case "$arch" in
                x86_64)  echo "linux-amd64" ;;
                aarch64) echo "linux-arm64" ;;
                *)       echo "linux-${arch}" ;;
            esac
            ;;
        darwin)
            case "$arch" in
                x86_64)  echo "darwin-amd64" ;;
                arm64)   echo "darwin-arm64" ;;
                *)       echo "darwin-${arch}" ;;
            esac
            ;;
        *)
            echo "${os}-${arch}"
            ;;
    esac
}

PLATFORM=$(detect_platform)
info "Detected platform: ${BOLD}${PLATFORM}${NC}"

# ── Prerequisites check ───────────────────────────────────────

check_optional() {
    if command -v "$1" &>/dev/null; then
        ok "$1 found: $(command -v "$1")"
        return 0
    else
        warn "$1 not found."
        return 1
    fi
}

echo -e "\n${MAGENTA}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NyaTickerTools - Setup                 ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

section "Checking prerequisites"

HAS_GIT=false
HAS_PYTHON=false
HAS_PIP=false
HAS_CARGO=false
HAS_GO=false

if check_optional git; then HAS_GIT=true; fi
if check_optional python3; then HAS_PYTHON=true; fi
if check_optional pip3 || check_optional pip; then HAS_PIP=true; fi
if check_optional cargo; then HAS_CARGO=true; fi
if check_optional go; then HAS_GO=true; fi

# ── Create tools directory ────────────────────────────────────

section "Setting up tools directory"

mkdir -p "$TOOLS_DIR"
ok "Created: $TOOLS_DIR"

# ── Clone tool repos ──────────────────────────────────────────

if [[ "$QUICK_MODE" == false ]]; then
    section "Cloning tool repositories"

    clone_or_update() {
        local name="$1" repo="$2" dir="$TOOLS_DIR/$name"
        if [[ -d "$dir/.git" ]]; then
            info "Updating ${BOLD}${name}${NC}..."
            if ! (cd "$dir" && git pull --rebase); then
                warn "  Update failed for ${name}."
            else
                ok "  ${name} is up to date."
            fi
        else
            info "Cloning ${BOLD}${name}${NC}..."
            if ! git clone --depth 1 "$repo" "$dir"; then
                err "  Failed to clone ${name} from ${repo}"
                return 1
            fi
            ok "  Cloned ${name}."
        fi
    }

    if [[ "$HAS_GIT" == true ]]; then
        clone_or_update "biliTickerBuy" "$BTB_REPO"
        clone_or_update "BHYG" "$BHYG_REPO"
        clone_or_update "bili_ticket_rush" "$RUSH_REPO"
        clone_or_update "bili-ticket-go" "$BTG_REPO"
    else
        err "git is required for cloning tool repos. Please install git."
        exit 1
    fi
else
    info "Quick mode: skipping git clones."
fi

# ── Install Python dependencies ───────────────────────────────

section "Installing Python dependencies"

if [[ "$HAS_PYTHON" == true && "$HAS_PIP" == true ]]; then
    # biliTickerBuy deps
    if [[ -f "$TOOLS_DIR/biliTickerBuy/requirements.txt" ]]; then
        info "Installing biliTickerBuy dependencies..."
        if ! pip3 install -r "$TOOLS_DIR/biliTickerBuy/requirements.txt" --quiet; then
            if ! pip install -r "$TOOLS_DIR/biliTickerBuy/requirements.txt" --quiet; then
                warn "Failed to install biliTickerBuy deps."
            fi
        fi
        ok "biliTickerBuy dependencies installed."
    else
        # Try pip install from setup.py/pyproject.toml
        if [[ -d "$TOOLS_DIR/biliTickerBuy" ]]; then
            info "Installing biliTickerBuy via pip..."
            if ! pip3 install "$TOOLS_DIR/biliTickerBuy/" --quiet; then
                if ! pip install "$TOOLS_DIR/biliTickerBuy/" --quiet; then
                    warn "Failed to install biliTickerBuy."
                fi
            fi
        fi
    fi

    # BHYG deps
    if [[ -f "$TOOLS_DIR/BHYG/requirements.txt" ]]; then
        info "Installing BHYG dependencies..."
        if ! pip3 install -r "$TOOLS_DIR/BHYG/requirements.txt" --quiet; then
            if ! pip install -r "$TOOLS_DIR/BHYG/requirements.txt" --quiet; then
                warn "Failed to install BHYG deps."
            fi
        fi
        ok "BHYG dependencies installed."
    else
        if [[ -d "$TOOLS_DIR/BHYG" ]]; then
            info "Installing BHYG via pip..."
            if ! pip3 install "$TOOLS_DIR/BHYG/" --quiet; then
                if ! pip install "$TOOLS_DIR/BHYG/" --quiet; then
                    warn "Failed to install BHYG."
                fi
            fi
        fi
    fi

    # Common deps for NyaTickerTools scripts
    info "Installing common dependencies (pyyaml)..."
    if ! pip3 install pyyaml --quiet; then
        if ! pip install pyyaml --quiet; then
            warn "Failed to install pyyaml."
        fi
    fi
    ok "Common dependencies installed."
else
    warn "Python3/pip not found. Skipping Python dependency installation."
fi

# ── Download bili-ticket-go binary ────────────────────────────

section "Downloading bili-ticket-go binary"

BTG_DIR="$TOOLS_DIR/bili-ticket-go"
if [[ -d "$BTG_DIR" ]]; then
    # Determine binary name based on platform
    BINARY_NAME="btg-${PLATFORM}-static"
    if [[ "$PLATFORM" == darwin-* ]]; then
        BINARY_NAME="btg-${PLATFORM}"
    fi

    BINARY_PATH="$BTG_DIR/$BINARY_NAME"

    if [[ -f "$BINARY_PATH" ]]; then
        ok "Binary already exists: $BINARY_NAME"
    else
        info "Downloading ${BOLD}${BINARY_NAME}${NC}..."

        # Get latest release URL from GitHub
        DOWNLOAD_URL=$(curl -sL "https://api.github.com/repos/konaxia548/bili-ticket-go/releases/latest" \
            | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data.get('assets', []):
    name = asset['name']
    if '$PLATFORM' in name:
        print(asset['browser_download_url'])
        break
" 2>/dev/null) || true

        if [[ -n "$DOWNLOAD_URL" ]]; then
            info "  URL: $DOWNLOAD_URL"
            curl -sL "$DOWNLOAD_URL" -o "$BINARY_PATH"
            chmod +x "$BINARY_PATH"
            ok "Downloaded: $BINARY_NAME"
        else
            warn "Could not find binary for platform '${PLATFORM}'."
            warn "Download manually from: https://github.com/konaxia548/bili-ticket-go/releases"
        fi
    fi
else
    warn "bili-ticket-go directory not found. Was it cloned?"
fi

# ── Build bili_ticket_rush (optional) ─────────────────────────

section "Building bili_ticket_rush (optional)"

RUSH_DIR="$TOOLS_DIR/bili_ticket_rush"
if [[ -d "$RUSH_DIR" ]]; then
    if [[ "$HAS_CARGO" == true ]]; then
        info "Building bili_ticket_rush with Cargo..."
        (cd "$RUSH_DIR" && cargo build --release 2>&1) && \
            ok "bili_ticket_rush built successfully." || \
            warn "Build failed. You may need to install Rust dependencies."
    else
        warn "Rust/Cargo not found. Skipping bili_ticket_rush build."
        warn "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    fi
else
    warn "bili_ticket_rush directory not found."
fi

# ── Create config templates ───────────────────────────────────

section "Setting up config files"

CONFIG_DIR="$PROJECT_ROOT/config"

# Create accounts.yaml from sample if it doesn't exist
if [[ ! -f "$CONFIG_DIR/accounts.yaml" ]]; then
    if [[ -f "$CONFIG_DIR/sample_accounts.yaml" ]]; then
        cp "$CONFIG_DIR/sample_accounts.yaml" "$CONFIG_DIR/accounts.yaml"
        ok "Created config/accounts.yaml from sample."
        warn "Edit config/accounts.yaml with your credentials!"
    fi
else
    ok "config/accounts.yaml already exists."
fi

# Create tickets.yaml from sample if it doesn't exist
if [[ ! -f "$CONFIG_DIR/tickets.yaml" ]]; then
    if [[ -f "$CONFIG_DIR/sample_tickets.yaml" ]]; then
        cp "$CONFIG_DIR/sample_tickets.yaml" "$CONFIG_DIR/tickets.yaml"
        ok "Created config/tickets.yaml from sample."
        warn "Edit config/tickets.yaml with your target events!"
    fi
else
    ok "config/tickets.yaml already exists."
fi

# Create machines.yaml from sample if it doesn't exist
if [[ ! -f "$CONFIG_DIR/machines.yaml" ]]; then
    if [[ -f "$CONFIG_DIR/sample_machines.yaml" ]]; then
        cp "$CONFIG_DIR/sample_machines.yaml" "$CONFIG_DIR/machines.yaml"
        ok "Created config/machines.yaml from sample."
    fi
else
    ok "config/machines.yaml already exists."
fi

# ── Summary ───────────────────────────────────────────────────

section "Setup Complete"

echo -e "  ${GREEN}Tools directory:${NC}  $TOOLS_DIR"
echo -e "  ${GREEN}Config directory:${NC} $CONFIG_DIR"
echo -e "  ${GREEN}Platform:${NC}         $PLATFORM"
echo
echo "  Next steps:"
echo -e "    1. Edit ${CYAN}config/accounts.yaml${NC} with your credentials"
echo -e "    2. Edit ${CYAN}config/tickets.yaml${NC} with target events"
echo -e "    3. Generate configs: ${CYAN}python3 scripts/inject_config.py${NC}"
echo -e "    4. Start tools:      ${CYAN}./scripts/start_all.sh${NC}"
echo
