#!/usr/bin/env bash
# =============================================================
# NyaTickerTools - Deploy to Remote Machines
# =============================================================
# Deploys project files to remote machines via rsync + ssh.
# Reads config/machines.yaml for remote server list.
#
# Usage:
#   ./scripts/deploy.sh <machine_name|all>
#   ./scripts/deploy.sh server1
#   ./scripts/deploy.sh all
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
MACHINES_FILE="$CONFIG_DIR/machines.yaml"

# ── Parse arguments ───────────────────────────────────────────

if [[ $# -lt 1 ]]; then
    echo -e "\n${MAGENTA}"
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║   NyaTickerTools - Deploy                ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Usage: $0 <machine_name|all>"
    echo ""
    echo "Examples:"
    echo "  $0 server1       Deploy to server1"
    echo "  $0 all           Deploy to all machines"
    echo ""
    echo "Available machines:"
    if [[ -f "$MACHINES_FILE" ]]; then
        python3 -c "
import yaml
with open('$MACHINES_FILE', 'r') as f:
    data = yaml.safe_load(f)
for name, cfg in data.get('machines', {}).items():
    host = cfg.get('host', '?')
    user = cfg.get('user', 'root')
    print(f'  {name:20s} {user}@{host}')
" 2>/dev/null || echo "  (failed to parse machines.yaml)"
    else
        echo "  (config/machines.yaml not found)"
    fi
    echo
    exit 1
fi

TARGET="$1"

# ── Check prerequisites ───────────────────────────────────────

check_cmd() {
    if ! command -v "$1" &>/dev/null; then
        err "$1 is required but not installed."
        exit 1
    fi
}

check_cmd rsync
check_cmd ssh
check_cmd python3

if [[ ! -f "$MACHINES_FILE" ]]; then
    err "Machines config not found: $MACHINES_FILE"
    warn "Create config/machines.yaml with your deployment targets."
    warn "See config/machines.yaml.example for format."
    exit 1
fi

# ── Get machine list from YAML ────────────────────────────────

get_machine_info() {
    local machine_name="$1"
    python3 -c "
import yaml, sys
with open('$MACHINES_FILE', 'r') as f:
    data = yaml.safe_load(f)
machines = data.get('machines', {})
if '$machine_name' not in machines:
    print('NOT_FOUND', file=sys.stderr)
    sys.exit(1)
m = machines['$machine_name']
print(f\"{m.get('user', 'root')} {m.get('host', '')} {m.get('port', 22)} {m.get('remote_path', '/opt/NyaTickerTools')}\")
" 2>/dev/null
}

get_all_machines() {
    python3 -c "
import yaml
with open('$MACHINES_FILE', 'r') as f:
    data = yaml.safe_load(f)
for name in data.get('machines', {}):
    print(name)
" 2>/dev/null
}

# ── Deploy to a single machine ────────────────────────────────

deploy_to() {
    local machine_name="$1"

    echo
    info "Deploying to ${BOLD}${machine_name}${NC}..."

    local info_str
    info_str=$(get_machine_info "$machine_name") || {
        err "Machine '${machine_name}' not found in config."
        return 1
    }

    local user host port remote_path
    read -r user host port remote_path <<< "$info_str"

    if [[ -z "$host" ]]; then
        err "No host defined for machine '${machine_name}'."
        return 1
    fi

    info "  Target: ${CYAN}${user}@${host}:${port}${NC} → ${remote_path}"

    # Build rsync exclude list
    local rsync_opts=(
        -avz
        --progress
        --delete
        -e "ssh -p ${port} -o StrictHostKeyChecking=yes"
        --exclude='.git/'
        --exclude='tools/'                    # Don't sync cloned tool repos
        --exclude='__pycache__/'
        --exclude='*.pyc'
        --exclude='node_modules/'
        --exclude='.venv/'
        --exclude='venv/'
        --exclude='logs/'
        --exclude='.pids'
        --exclude='config/accounts.yaml'      # Sensitive - deploy separately
        --exclude='bhyg_config/'              # Sensitive - deploy separately
        --exclude='.env'
        --exclude='.env.*'
        --exclude='.DS_Store'
        --exclude='*.log'
    )

    # Sync project files
    info "  Syncing files..."
    rsync "${rsync_opts[@]}" \
        "$PROJECT_ROOT/" \
        "${user}@${host}:${remote_path}/" || {
        err "  Rsync failed for ${machine_name}."
        return 1
    }
    ok "  Files synced."

    # Remote: install dependencies and setup
    info "  Running remote setup..."
    ssh -p "$port" "${user}@${host}" "cd ${remote_path} && bash scripts/setup.sh --quick" || {
        warn "  Remote setup had issues. Check the remote machine."
    }

    ok "  Deployment to ${BOLD}${machine_name}${NC} complete!"
}

# ── Main ──────────────────────────────────────────────────────

echo -e "\n${MAGENTA}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NyaTickerTools - Deploy                ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

if [[ "$TARGET" == "all" ]]; then
    MACHINES=$(get_all_machines)
    if [[ -z "$MACHINES" ]]; then
        err "No machines defined in config."
        exit 1
    fi

    total=0
    success=0
    failed=0

    while IFS= read -r machine; do
        [[ -z "$machine" ]] && continue
        ((total++))
        if deploy_to "$machine"; then
            ((success++))
        else
            ((failed++))
        fi
    done <<< "$MACHINES"

    echo
    info "Deployment summary: ${success}/${total} succeeded, ${failed} failed."
else
    deploy_to "$TARGET"
fi

echo
