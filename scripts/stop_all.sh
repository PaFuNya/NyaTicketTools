#!/usr/bin/env bash
# =============================================================
# NyaTicketTools - Stop All
# =============================================================
# Stops all running tools. Reads .pids, sends SIGTERM, waits, then SIGKILL.
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
PIDS_FILE="$PROJECT_ROOT/.pids"

echo -e "\n${MAGENTA}NyaTicketTools - Stop${NC}\n"

if [[ ! -f "$PIDS_FILE" ]]; then
    warn "No .pids file found."
    pgrep -f "biliTickerBuy" &>/dev/null && warn "Found stray biliTickerBuy processes. Use: pkill biliTickerBuy"
    exit 0
fi

stopped=0
while IFS=: read -r tool pid; do
    if kill -0 "$pid" 2>/dev/null; then
        info "Stopping ${BOLD}${tool}${NC} (PID: ${pid})..."
        kill "$pid" 2>/dev/null || true
        for i in {1..5}; do
            kill -0 "$pid" 2>/dev/null || break
            sleep 1
        done
        kill -0 "$pid" 2>/dev/null && { warn "Force killing ${tool}..."; kill -9 "$pid" 2>/dev/null || true; }
        ok "${tool} stopped."
        ((stopped++))
    else
        info "${tool} was already stopped."
    fi
done < "$PIDS_FILE"

rm -f "$PIDS_FILE"
echo
if [[ $stopped -eq 0 ]]; then
    ok "All tools already stopped."
else
    ok "Stopped ${BOLD}${stopped}${NC} process(es)."
fi
echo
