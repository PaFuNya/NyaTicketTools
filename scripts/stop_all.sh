#!/usr/bin/env bash
# =============================================================
# NyaTickerTools - Stop All Tools
# =============================================================
# Gracefully stops all running tools.
# Reads .pids file, sends SIGTERM, waits 5s, then SIGKILL.
#
# Usage:
#   ./scripts/stop_all.sh
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
PIDS_FILE="$PROJECT_ROOT/.pids"

# ── Main ──────────────────────────────────────────────────────

echo -e "\n${MAGENTA}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NyaTickerTools - Stop All Tools        ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}\n"

if [[ ! -f "$PIDS_FILE" ]]; then
    warn "No .pids file found at $PIDS_FILE"
    warn "No tracked processes to stop."

    # Still try to find any stray processes
    info "Searching for any running NyaTickerTools processes..."
    found=0
    for pattern in "biliTickerBuy" "bili-ticket-go" "btg-"; do
        pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            warn "Found stray process(es) matching '$pattern': $pids"
            found=1
        fi
    done
    if [[ $found -eq 0 ]]; then
        ok "No NyaTickerTools processes found running."
    else
        warn "To kill stray processes manually: pkill -f <pattern>"
    fi
    echo
    exit 0
fi

# Read and process PIDs
total=0
killed=0
already_dead=0
pids_to_kill=()

while IFS=: read -r tool_name pid; do
    # Skip empty/comment lines
    [[ -z "$tool_name" || "$tool_name" == "#"* ]] && continue
    [[ -z "$pid" ]] && continue

    ((total++))

    # Check if process is still running
    if kill -0 "$pid" 2>/dev/null; then
        info "Stopping ${BOLD}${tool_name}${NC} (PID: ${CYAN}${pid}${NC})..."
        pids_to_kill+=("${tool_name}:${pid}")
    else
        warn "${tool_name} (PID: ${pid}) is already stopped."
        ((already_dead++))
    fi
done < "$PIDS_FILE"

if [[ ${#pids_to_kill[@]} -eq 0 ]]; then
    ok "All tracked processes already stopped."
    rm -f "$PIDS_FILE"
    echo
    exit 0
fi

# Phase 1: Send SIGTERM to all
info "Sending SIGTERM to ${#pids_to_kill[@]} process(es)..."
for entry in "${pids_to_kill[@]}"; do
    IFS=: read -r tool_name pid <<< "$entry"
    kill -TERM "$pid" 2>/dev/null || true
done

# Phase 2: Wait up to 5 seconds for graceful shutdown
info "Waiting up to 5 seconds for graceful shutdown..."
remaining=()
for entry in "${pids_to_kill[@]}"; do
    IFS=: read -r tool_name pid <<< "$entry"
    waited=0
    while kill -0 "$pid" 2>/dev/null && [[ $waited -lt 5 ]]; do
        sleep 1
        ((waited++))
    done

    if kill -0 "$pid" 2>/dev/null; then
        remaining+=("${entry}")
    else
        ok "Stopped ${BOLD}${tool_name}${NC} (PID: ${pid}) [SIGTERM]"
        ((killed++))
    fi
done

# Phase 3: Force kill any remaining
if [[ ${#remaining[@]} -gt 0 ]]; then
    warn "${#remaining[@]} process(es) didn't stop gracefully. Sending SIGKILL..."
    for entry in "${remaining[@]}"; do
        IFS=: read -r tool_name pid <<< "$entry"
        kill -KILL "$pid" 2>/dev/null || true
        if ! kill -0 "$pid" 2>/dev/null; then
            ok "Killed ${BOLD}${tool_name}${NC} (PID: ${pid}) [SIGKILL]"
            ((killed++))
        else
            err "Failed to kill ${tool_name} (PID: ${pid})"
        fi
    done
fi

# Clean up PID file
rm -f "$PIDS_FILE"

# Summary
echo
ok "Done. Stopped ${BOLD}${killed}${NC} process(es), ${already_dead} already stopped."
info "PID file cleaned up."
echo
