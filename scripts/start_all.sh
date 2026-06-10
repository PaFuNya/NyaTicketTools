#!/usr/bin/env bash
# =============================================================
# NyaTickerTools - Start All Tools
# =============================================================
# One-click start all tools on this machine.
# Reads config/tickets.yaml for target info.
# Logs PIDs to .pids file.
#
# Usage:
#   ./scripts/start_all.sh [--tool <name>]
#   ./scripts/start_all.sh --tool biliTickerBuy
#   ./scripts/start_all.sh --tool bili-ticket-go
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

# ── Paths ─────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
TICKETS_FILE="$CONFIG_DIR/tickets.yaml"
PIDS_FILE="$PROJECT_ROOT/.pids"
LOGS_DIR="$PROJECT_ROOT/logs"

BTB_DIR="$PROJECT_ROOT/tools/biliTickerBuy"
BTG_DIR="$PROJECT_ROOT/tools/bili-ticket-go"
BHYG_DIR="$PROJECT_ROOT/tools/BHYG"
BTR_DIR="$PROJECT_ROOT/tools/bili_ticket_rush"
BTB_CONFIG="$CONFIG_DIR/generated/biliTickerBuy/config.json"
BHYG_CONFIG_DIR="$CONFIG_DIR/generated/BHYG"

# ── Parse arguments ───────────────────────────────────────────

TOOL_FILTER=""
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --tool)
            TOOL_FILTER="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--tool <name>] [--dry-run]"
            echo ""
            echo "Options:"
            echo "  --tool <name>   Start only the specified tool"
            echo "                  (biliTickerBuy, bili-ticket-go)"
            echo "  --dry-run       Show what would be started without starting"
            echo "  -h, --help      Show this help"
            exit 0
            ;;
        *)
            err "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# ── Helpers ───────────────────────────────────────────────────

should_start() {
    local tool_name="$1"
    [[ -z "$TOOL_FILTER" ]] || [[ "$TOOL_FILTER" == "$tool_name" ]]
}

log_pid() {
    local tool_name="$1"
    local pid="$2"
    echo "${tool_name}:${pid}" >> "$PIDS_FILE"
    ok "Started ${BOLD}${tool_name}${NC} (PID: ${CYAN}${pid}${NC})"
}

# ── Pre-checks ────────────────────────────────────────────────

echo -e "\n${MAGENTA}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NyaTickerTools - Start All Tools       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}\n"

# Create logs directory
mkdir -p "$LOGS_DIR"

# Rotate old logs (keep 7 days)
find "$LOGS_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true

# Auto-inject config if generated configs are missing or stale
if [[ ! -d "$CONFIG_DIR/generated" ]] || [[ "$CONFIG_DIR/accounts.yaml" -nt "$CONFIG_DIR/generated" 2>/dev/null ]]; then
    info "Auto-generating tool configs from YAML..."
    python3 "$PROJECT_ROOT/scripts/inject_config.py" || warn "Config generation had issues"
    echo
fi

# Initialize PID file
if [[ -f "$PIDS_FILE" ]]; then
    warn "Existing .pids file found. Cleaning up stale entries..."
    # Remove entries for processes that are no longer running
    tmp_pids=$(mktemp)
    while IFS=: read -r tool pid; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "${tool}:${pid}" >> "$tmp_pids"
        fi
    done < "$PIDS_FILE"
    mv "$tmp_pids" "$PIDS_FILE"
fi

# Parse tickets.yaml for info
if [[ ! -f "$TICKETS_FILE" ]]; then
    err "Tickets config not found: $TICKETS_FILE"
    warn "Copy the sample: cp config/sample_tickets.yaml config/tickets.yaml"
    exit 1
fi

# Check if Python and PyYAML are available
if ! command -v python3 &>/dev/null; then
    err "python3 is required but not found."
    exit 1
fi

# ── Extract ticket info via Python ────────────────────────────

TICKET_INFO=$(python3 -c "
import yaml, sys
with open('$TICKETS_FILE', 'r') as f:
    data = yaml.safe_load(f)
tickets = data.get('tickets', [])
enabled = [t for t in tickets if t.get('enabled', False)]
print(f'total={len(tickets)}')
print(f'enabled={len(enabled)}')
for t in enabled:
    name = t.get('name', 'Unknown')
    pid = t.get('project_id', '?')
    sid = t.get('screen_id', '?')
    skid = t.get('sku_id', '?')
    tools = ','.join(t.get('tools', []))
    sale = t.get('sale_start', 'N/A')
    print(f'  ticket: {name} | project={pid} screen={sid} sku={skid} | tools={tools} | sale={sale}')
" 2>/dev/null) || {
    err "Failed to parse tickets.yaml"
    exit 1
}

info "Ticket configuration:"
echo "$TICKET_INFO" | while IFS= read -r line; do
    echo -e "    ${line}"
done
echo

# ── Check which tools have enabled tickets ────────────────────

HAS_BTB=$(python3 -c "
import yaml
with open('$TICKETS_FILE', 'r') as f:
    data = yaml.safe_load(f)
for t in data.get('tickets', []):
    if t.get('enabled', False) and 'biliTickerBuy' in t.get('tools', []):
        print('yes')
        break
" 2>/dev/null || echo "")

HAS_BTG=$(python3 -c "
import yaml
with open('$TICKETS_FILE', 'r') as f:
    data = yaml.safe_load(f)
for t in data.get('tickets', []):
    if t.get('enabled', False) and 'bili-ticket-go' in t.get('tools', []):
        print('yes')
        break
" 2>/dev/null || echo "")

HAS_BHYG=$(python3 -c "
import yaml
with open('$TICKETS_FILE', 'r') as f:
    data = yaml.safe_load(f)
for t in data.get('tickets', []):
    if t.get('enabled', False) and 'BHYG' in t.get('tools', []):
        print('yes')
        break
" 2>/dev/null || echo "")

HAS_BTR=$(python3 -c "
import yaml
with open('$TICKETS_FILE', 'r') as f:
    data = yaml.safe_load(f)
for t in data.get('tickets', []):
    if t.get('enabled', False) and 'bili_ticket_rush' in t.get('tools', []):
        print('yes')
        break
" 2>/dev/null || echo "")

# ── Start biliTickerBuy ──────────────────────────────────────

start_btb() {
    if ! should_start "biliTickerBuy"; then
        return
    fi

    info "Starting biliTickerBuy..."

    if [[ ! -d "$BTB_DIR" ]]; then
        err "biliTickerBuy not found at $BTB_DIR"
        warn "Run ./scripts/setup.sh first to clone tools."
        return
    fi

    if [[ ! -f "$BTB_CONFIG" ]]; then
        err "biliTickerBuy config not found: $BTB_CONFIG"
        warn "Run: python3 scripts/inject_config.py"
        return
    fi

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local log_file="$LOGS_DIR/biliTickerBuy-${timestamp}.log"

    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would start biliTickerBuy with config: $BTB_CONFIG"
        info "  Log: $log_file"
        return
    fi

    # Start in background
    cd "$BTB_DIR"
    python3 -m biliTickerBuy buy "$BTB_CONFIG" \
        --interval 1000 \
        > "$log_file" 2>&1 &
    local pid=$!
    cd "$PROJECT_ROOT"

    log_pid "biliTickerBuy" "$pid"
    info "  Log: $log_file"
}

# ── Start bili-ticket-go ─────────────────────────────────────

start_btg() {
    if ! should_start "bili-ticket-go"; then
        return
    fi

    info "Starting bili-ticket-go..."

    if [[ ! -d "$BTG_DIR" ]]; then
        err "bili-ticket-go not found at $BTG_DIR"
        warn "Run ./scripts/setup.sh first to clone tools."
        return
    fi

    # Detect binary name based on platform
    local binary=""
    if [[ -f "$BTG_DIR/btg-linux-amd64-static" ]]; then
        binary="$BTG_DIR/btg-linux-amd64-static"
    elif [[ -f "$BTG_DIR/btg-linux-arm64-static" ]]; then
        binary="$BTG_DIR/btg-linux-arm64-static"
    elif [[ -f "$BTG_DIR/btg-darwin-amd64" ]]; then
        binary="$BTG_DIR/btg-darwin-amd64"
    elif [[ -f "$BTG_DIR/btg-darwin-arm64" ]]; then
        binary="$BTG_DIR/btg-darwin-arm64"
    else
        # Try to find any btg binary
        binary=$(find "$BTG_DIR" -maxdepth 1 -name "btg-*" -type f -executable 2>/dev/null | head -1)
    fi

    if [[ -z "$binary" || ! -f "$binary" ]]; then
        err "bili-ticket-go binary not found in $BTG_DIR"
        warn "Run ./scripts/setup.sh first to download the binary."
        return
    fi

    chmod +x "$binary"

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local log_file="$LOGS_DIR/bili-ticket-go-${timestamp}.log"
    local btg_port="${BTG_PORT:-8081}"

    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would start bili-ticket-go on port $btg_port"
        info "  Log: $log_file"
        return
    fi

    # Start in web mode
    "$binary" -web -port "$btg_port" -host 0.0.0.0 \
        > "$log_file" 2>&1 &
    local pid=$!

    log_pid "bili-ticket-go" "$pid"
    info "  Log: $log_file"
    info "  Web UI: http://$(hostname -I | awk '{print $1}'):${btg_port}"
}

# ── Start BHYG ─────────────────────────────────────────────

start_bhyg() {
    if ! should_start "BHYG"; then
        return
    fi

    info "Starting BHYG..."

    if [[ ! -d "$BHYG_DIR" ]]; then
        err "BHYG not found at $BHYG_DIR"
        warn "Run ./scripts/setup.sh first to clone tools."
        return
    fi

    if [[ ! -f "$BHYG_DIR/main.py" ]]; then
        err "BHYG main.py not found in $BHYG_DIR"
        return
    fi

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local log_file="$LOGS_DIR/BHYG-${timestamp}.log"

    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would start BHYG"
        info "  Log: $log_file"
        return
    fi

    # Start BHYG in background
    cd "$BHYG_DIR"
    python3 main.py \
        > "$log_file" 2>&1 &
    local pid=$!
    cd "$PROJECT_ROOT"

    log_pid "BHYG" "$pid"
    info "  Log: $log_file"
}

# ── Start bili_ticket_rush ──────────────────────────────────

start_btr() {
    if ! should_start "bili_ticket_rush"; then
        return
    fi

    info "Starting bili_ticket_rush..."

    if [[ ! -d "$BTR_DIR" ]]; then
        err "bili_ticket_rush not found at $BTR_DIR"
        warn "Run ./scripts/setup.sh first to clone tools."
        return
    fi

    # Find the binary (could be in target/release or root)
    local binary=""
    if [[ -f "$BTR_DIR/target/release/bili_ticket_rush" ]]; then
        binary="$BTR_DIR/target/release/bili_ticket_rush"
    elif [[ -f "$BTR_DIR/target/release/bili_ticket_rush.exe" ]]; then
        binary="$BTR_DIR/target/release/bili_ticket_rush.exe"
    elif [[ -f "$BTR_DIR/bili_ticket_rush" ]]; then
        binary="$BTR_DIR/bili_ticket_rush"
    elif [[ -f "$BTR_DIR/bili_ticket_rush.exe" ]]; then
        binary="$BTR_DIR/bili_ticket_rush.exe"
    else
        # Try to find any matching binary
        binary=$(find "$BTR_DIR" -name "bili_ticket_rush*" -type f -executable 2>/dev/null | head -1)
    fi

    if [[ -z "$binary" || ! -f "$binary" ]]; then
        err "bili_ticket_rush binary not found."
        warn "Build it: cd tools/bili_ticket_rush && cargo build --release"
        warn "Or launch manually from the GUI."
        return
    fi

    chmod +x "$binary" 2>/dev/null || true

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local log_file="$LOGS_DIR/bili_ticket_rush-${timestamp}.log"

    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would start bili_ticket_rush: $binary"
        info "  Log: $log_file"
        return
    fi

    # bili_ticket_rush is a GUI app - try to launch it
    # On desktop environments this will open the GUI window
    # On headless servers this will likely fail (expected)
    "$binary" > "$log_file" 2>&1 &
    local pid=$!

    if kill -0 "$pid" 2>/dev/null; then
        log_pid "bili_ticket_rush" "$pid"
        info "  Log: $log_file"
        info "  Note: bili_ticket_rush is a GUI app - requires desktop environment"
    else
        warn "bili_ticket_rush failed to start (no display server?)"
        warn "Launch manually from desktop environment."
    fi
}

# ── Main ──────────────────────────────────────────────────────

started=0

if [[ -n "$HAS_BTB" ]]; then
    start_btb
    ((started++))
else
    if should_start "biliTickerBuy"; then
        warn "No enabled tickets use biliTickerBuy. Skipping."
    fi
fi

if [[ -n "$HAS_BTG" ]]; then
    start_btg
    ((started++))
else
    if should_start "bili-ticket-go"; then
        warn "No enabled tickets use bili-ticket-go. Skipping."
    fi
fi

if [[ -n "$HAS_BHYG" ]]; then
    start_bhyg
    ((started++))
else
    if should_start "BHYG"; then
        warn "No enabled tickets use BHYG. Skipping."
    fi
fi

if [[ -n "$HAS_BTR" ]]; then
    start_btr
    ((started++))
else
    if should_start "bili_ticket_rush"; then
        warn "No enabled tickets use bili_ticket_rush. Skipping."
    fi
fi

# ── Start Web Dashboard ──────────────────────────────────────

if [[ "$DRY_RUN" == false ]]; then
    if [[ -f "$PROJECT_ROOT/web/server.py" ]]; then
        info "Starting Web Dashboard..."
        WEB_PORT="${WEB_PORT:-8090}"
        WEB_LOG="$LOGS_DIR/web-dashboard-$(date +%Y%m%d-%H%M%S).log"
        python3 "$PROJECT_ROOT/web/server.py" --port "$WEB_PORT" \
            > "$WEB_LOG" 2>&1 &
        log_pid "web-dashboard" "$!"
        info "  Dashboard: http://$(hostname -I | awk '{print $1}'):${WEB_PORT}"
        info "  Log: $WEB_LOG"
        ((started++))
    fi
else
    info "[DRY RUN] Would start Web Dashboard on port ${WEB_PORT:-8090}"
fi

echo
if [[ $started -eq 0 ]]; then
    warn "No tools were started."
    warn "Enable tickets in config/tickets.yaml and ensure tools are installed."
else
    ok "Started ${BOLD}${started}${NC} tool(s). PIDs saved to: ${CYAN}${PIDS_FILE}${NC}"
    echo
    info "To stop all tools: ./scripts/stop_all.sh"
    info "To view logs: tail -f logs/*.log"
fi
echo
