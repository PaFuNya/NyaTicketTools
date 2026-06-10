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
BTB_CONFIG="$CONFIG_DIR/generated/biliTickerBuy/config.json"

# ── Parse arguments ───────────────────────────────────────────

TOOL_FILTER=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --tool)
            TOOL_FILTER="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--tool <name>]"
            echo ""
            echo "Options:"
            echo "  --tool <name>   Start only the specified tool"
            echo "                  (biliTickerBuy, bili-ticket-go)"
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

    local log_file="$LOGS_DIR/biliTickerBuy.log"

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

    local log_file="$LOGS_DIR/bili-ticket-go.log"

    # Start in web mode on port 8080
    "$binary" -web -port 8080 -host 0.0.0.0 \
        > "$log_file" 2>&1 &
    local pid=$!

    log_pid "bili-ticket-go" "$pid"
    info "  Log: $log_file"
    info "  Web UI: http://$(hostname -I | awk '{print $1}'):8080"
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
