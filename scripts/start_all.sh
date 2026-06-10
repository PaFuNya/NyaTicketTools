#!/usr/bin/env bash
# =============================================================
# NyaTicketTools - Start All
# =============================================================
# Starts the Web Dashboard and auto-generates configs.
# The buy engine is controlled through the web API.
#
# Usage:
#   ./scripts/start_all.sh [--dry-run]
#   ./scripts/start_all.sh --dashboard-only
# =============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
err()   { echo -e "${RED}✗${NC}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
PIDS_FILE="$PROJECT_ROOT/.pids"
LOGS_DIR="$PROJECT_ROOT/logs"

DRY_RUN=false
DASHBOARD_ONLY=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --dashboard-only) DASHBOARD_ONLY=true; shift ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--dashboard-only]"
            echo "  --dry-run          Preview only"
            echo "  --dashboard-only   Skip config generation"
            exit 0 ;;
        *) err "Unknown argument: $1"; exit 1 ;;
    esac
done

log_pid() {
    local name="$1"; local pid="$2"
    echo "${name}:${pid}" >> "$PIDS_FILE"
    ok "Started ${BOLD}${name}${NC} (PID: ${CYAN}${pid}${NC})"
}

echo -e "\n${MAGENTA}  NyaTicketTools${NC}\n"
mkdir -p "$LOGS_DIR"
find "$LOGS_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true

# Clean up stale PIDs
if [[ -f "$PIDS_FILE" ]]; then
    tmp=$(mktemp)
    while IFS=: read -r tool pid; do
        kill -0 "$pid" 2>/dev/null && echo "${tool}:${pid}" >> "$tmp" || true
    done < "$PIDS_FILE"
    mv "$tmp" "$PIDS_FILE" 2>/dev/null || true
fi

# Auto-generate configs
if [[ "$DASHBOARD_ONLY" != true ]]; then
    if [[ ! -f "$CONFIG_DIR/generated/biliTickerBuy/config.json" ]] || \
       [[ "$CONFIG_DIR/accounts.yaml" -nt "$CONFIG_DIR/generated" ]] 2>/dev/null; then
        info "Generating biliTickerBuy config..."
        if [[ "$DRY_RUN" == true ]]; then
            python3 "$PROJECT_ROOT/scripts/inject_config.py" --dry-run || true
        else
            python3 "$PROJECT_ROOT/scripts/inject_config.py" || warn "Config generation had issues"
        fi
    fi
fi

echo
started=0

# Start Web Dashboard
if [[ "$DRY_RUN" == false ]]; then
    if [[ -f "$PROJECT_ROOT/web/server.py" ]]; then
        info "Starting Web Dashboard..."
        WEB_PORT="${WEB_PORT:-8090}"
        WEB_LOG="$LOGS_DIR/web-dashboard-$(date +%Y%m%d-%H%M%S).log"
        python3 "$PROJECT_ROOT/web/server.py" --port "$WEB_PORT" \
            > "$WEB_LOG" 2>&1 &
        log_pid "web-dashboard" "$!"
        info "  Dashboard: http://$(hostname -I | awk '{print $1}' 2>/dev/null || echo 'localhost'):${WEB_PORT}"
        info "  Log: $WEB_LOG"
        ((started++))
    fi
else
    info "[DRY RUN] Would start Web Dashboard on port ${WEB_PORT:-8090}"
fi

echo
if [[ $started -eq 0 ]]; then
    warn "Nothing was started."
else
    ok "Started ${BOLD}${started}${NC} service(s)."
    echo
    info "Stop:  ./scripts/stop_all.sh"
    info "Logs:  tail -f logs/*.log"
fi
echo
