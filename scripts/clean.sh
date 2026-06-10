#!/usr/bin/env bash
# =============================================================
# NyaTickerTools - Clean Up Script
# =============================================================
# Usage:
#   ./clean.sh --tools    Delete tools/ directory
#   ./clean.sh --config   Clear generated configs (keep sample_* files)
#   ./clean.sh --logs     Clear log files
#   ./clean.sh --all      Restore clean state (keep .git and samples)
# =============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

confirm() {
    local msg="$1"
    read -p "$(echo -e "${YELLOW}⚠${NC}  ${msg} (y/N) ")" -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

echo -e "\n${MAGENTA}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NyaTickerTools - Clean Up              ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}\n"

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 [--tools] [--config] [--logs] [--all]"
    echo ""
    echo "Options:"
    echo "  --tools    Delete tools/ directory"
    echo "  --config   Clear generated configs (keep sample_* files)"
    echo "  --logs     Clear log files"
    echo "  --all      Restore clean state (keep .git and samples)"
    exit 1
fi

for arg in "$@"; do
    case "$arg" in
        --tools)
            if [[ -d "$PROJECT_ROOT/tools" ]]; then
                if confirm "Delete entire tools/ directory?"; then
                    rm -rf "$PROJECT_ROOT/tools"
                    ok "Deleted tools/"
                fi
            else
                info "tools/ does not exist."
            fi
            ;;
        --config)
            info "Cleaning generated configs..."
            # Remove generated config dir
            if [[ -d "$PROJECT_ROOT/config/generated" ]]; then
                rm -rf "$PROJECT_ROOT/config/generated"
                ok "Deleted config/generated/"
            fi
            # Remove non-sample yaml configs
            for f in accounts.yaml tickets.yaml machines.yaml; do
                if [[ -f "$PROJECT_ROOT/config/$f" ]]; then
                    rm -f "$PROJECT_ROOT/config/$f"
                    ok "Deleted config/$f"
                fi
            done
            # Remove biliTickerBuy configs
            for f in config.json ticket_config.json; do
                if [[ -f "$PROJECT_ROOT/config/$f" ]]; then
                    rm -f "$PROJECT_ROOT/config/$f"
                    ok "Deleted config/$f"
                fi
            done
            ;;
        --logs)
            if [[ -d "$PROJECT_ROOT/logs" ]]; then
                count=$(find "$PROJECT_ROOT/logs" -name "*.log" | wc -l)
                if [[ $count -gt 0 ]]; then
                    if confirm "Delete $count log file(s)?"; then
                        find "$PROJECT_ROOT/logs" -name "*.log" -delete
                        ok "Deleted $count log file(s)"
                    fi
                else
                    info "No log files to clean."
                fi
            else
                info "logs/ does not exist."
            fi
            ;;
        --all)
            if confirm "Restore clean state? This deletes tools/, logs/, generated configs, and .pids"; then
                rm -rf "$PROJECT_ROOT/tools"
                ok "Deleted tools/"
                rm -rf "$PROJECT_ROOT/config/generated"
                ok "Deleted config/generated/"
                for f in accounts.yaml tickets.yaml machines.yaml; do
                    rm -f "$PROJECT_ROOT/config/$f"
                done
                ok "Deleted generated config files"
                rm -rf "$PROJECT_ROOT/logs"
                ok "Deleted logs/"
                rm -f "$PROJECT_ROOT/.pids"
                ok "Deleted .pids"
                echo
                info "Clean state restored. Sample files and .git preserved."
            fi
            ;;
        *)
            warn "Unknown option: $arg"
            ;;
    esac
done

echo
