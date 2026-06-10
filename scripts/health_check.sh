#!/usr/bin/env bash
# =============================================================
# NyaTickerTools - Health Check
# =============================================================
# Checks system readiness: Python, deps, configs, tools, network.
# Exit code = number of failed checks.
# =============================================================

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC}  $*"; ((passed++)); }
fail() { echo -e "  ${RED}✗${NC}  $*"; ((failed++)); }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
TOOLS_DIR="$PROJECT_ROOT/tools"

passed=0
failed=0

echo -e "\n${MAGENTA}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NyaTickerTools - Health Check          ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}\n"

# 1. Python version
echo -e "${CYAN}── System ──${NC}"
if command -v python3 &>/dev/null; then
    pyver=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    major=$(python3 -c "import sys; print(sys.version_info.major)")
    minor=$(python3 -c "import sys; print(sys.version_info.minor)")
    if [[ "$major" -ge 3 && "$minor" -ge 8 ]]; then
        pass "Python $pyver"
    else
        fail "Python $pyver (need >= 3.8)"
    fi
else
    fail "python3 not found"
fi

# 2. PyYAML
if python3 -c "import yaml" 2>/dev/null; then
    pass "PyYAML installed"
else
    fail "PyYAML not installed (pip3 install pyyaml)"
fi

# 3. Git
if command -v git &>/dev/null; then
    pass "git available"
else
    fail "git not found"
fi

# 4. Config files
echo -e "\n${CYAN}── Config ──${NC}"
for f in accounts.yaml tickets.yaml; do
    if [[ -f "$CONFIG_DIR/$f" ]]; then
        if python3 -c "import yaml; yaml.safe_load(open('$CONFIG_DIR/$f'))" 2>/dev/null; then
            pass "$f exists and is valid YAML"
        else
            fail "$f exists but has invalid YAML syntax"
        fi
    else
        fail "$f not found (cp config/sample_$f config/$f)"
    fi
done

# 5. Tool directories
echo -e "\n${CYAN}── Tools ──${NC}"
for tool in biliTickerBuy BHYG bili_ticket_rush bili-ticket-go; do
    if [[ -d "$TOOLS_DIR/$tool" ]]; then
        pass "$tool directory exists"
    else
        fail "$tool directory not found (run: nyaticket setup)"
    fi
done

# 6. bili-ticket-go binary
btg_bin=$(find "$TOOLS_DIR/bili-ticket-go" -maxdepth 1 -name "btg-*" -type f 2>/dev/null | head -1)
if [[ -n "$btg_bin" ]]; then
    pass "bili-ticket-go binary found: $(basename "$btg_bin")"
else
    warn "bili-ticket-go binary not found (run: nyaticket setup)"
fi

# 7. Network connectivity
echo -e "\n${CYAN}── Network ──${NC}"
if curl -s --max-time 5 -o /dev/null -w "%{http_code}" "https://api.bilibili.com" | grep -q "200\|404\|412"; then
    pass "Bilibili API reachable"
else
    warn "Cannot reach Bilibili API (may be network issue or rate limit)"
fi

# 8. Running processes
echo -e "\n${CYAN}── Processes ──${NC}"
PIDS_FILE="$PROJECT_ROOT/.pids"
if [[ -f "$PIDS_FILE" ]]; then
    running=0
    while IFS=: read -r tool pid; do
        [[ -z "$tool" || "$tool" == "#"* ]] && continue
        [[ -z "$pid" ]] && continue
        if kill -0 "$pid" 2>/dev/null; then
            pass "$tool running (PID: $pid)"
            ((running++))
        else
            warn "$tool PID $pid is dead (stale .pids entry)"
        fi
    done < "$PIDS_FILE"
    if [[ $running -eq 0 ]]; then
        warn "No tracked processes running"
    fi
else
    warn "No .pids file (no tools currently tracked)"
fi

# Summary
echo -e "\n${CYAN}── Summary ──${NC}"
echo -e "  ${GREEN}Passed:${NC} $passed"
echo -e "  ${RED}Failed:${NC} $failed"
echo

exit $failed
