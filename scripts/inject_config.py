#!/usr/bin/env python3
"""
NyaTickerTools - Unified Config Injection Script

Reads config/accounts.yaml + config/tickets.yaml and generates tool-specific configs.
Uses hostname to determine which accounts to assign to this machine.

Usage:
    python3 inject_config.py [--dry-run]
"""

import argparse
import json
import os
import platform
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("\033[31m✗\033[0m PyYAML not installed. Run: pip3 install pyyaml")
    sys.exit(1)

# ── Colored output helpers ───────────────────────────────────────────────────

def info(msg):
    print(f"\033[34mℹ\033[0m  {msg}")

def ok(msg):
    print(f"\033[32m✓\033[0m  {msg}")

def warn(msg):
    print(f"\033[33m⚠\033[0m  {msg}")

def err(msg):
    print(f"\033[31m✗\033[0m  {msg}")

def section(title):
    print(f"\n\033[1;36m{'─'*60}\033[0m")
    print(f"\033[1;36m  {title}\033[0m")
    print(f"\033[1;36m{'─'*60}\033[0m")

# ── Path setup ───────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONFIG_DIR = PROJECT_ROOT / "config"

ACCOUNTS_FILE = CONFIG_DIR / "accounts.yaml"
TICKETS_FILE = CONFIG_DIR / "tickets.yaml"
MACHINES_FILE = CONFIG_DIR / "machines.yaml"

# Output paths
BTB_CONFIG_DIR = CONFIG_DIR / "generated" / "biliTickerBuy"
BTB_CONFIG_FILE = BTB_CONFIG_DIR / "config.json"

# ── Load YAML configs ────────────────────────────────────────────────────────

def load_yaml(path, required=True):
    """Load a YAML file, return dict or exit on error."""
    if not path.exists():
        if required:
            err(f"Required config not found: {path}")
            warn(f"Copy the sample: cp {path.with_name('sample_' + path.name)} {path}")
            sys.exit(1)
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if data else {}

def get_hostname():
    """Get short hostname (without domain)."""
    return platform.node().split(".")[0].lower()

def get_accounts_for_host(accounts_cfg, hostname):
    """Determine which accounts are assigned to this machine based on hostname."""
    accounts = accounts_cfg.get("accounts", [])

    # Check machines.yaml for hostname → account mapping
    machines_cfg = load_yaml(MACHINES_FILE, required=False)
    machine_map = machines_cfg.get("machines", {})

    # If hostname is in machines config, filter by assigned accounts
    assigned_names = None
    if hostname in machine_map:
        assigned_names = machine_map[hostname].get("accounts", None)

    result = []
    for acc in accounts:
        if not acc.get("enabled", True):
            continue
        if assigned_names is not None:
            # Only include accounts explicitly assigned to this machine
            if acc["name"] in assigned_names:
                result.append(acc)
        else:
            # No machine config: include all enabled accounts
            result.append(acc)

    if not result:
        warn(f"No accounts assigned to host '{hostname}'. "
             "Check config/machines.yaml or accounts.yaml.")
    return result

# ── Cookie parser ────────────────────────────────────────────────────────────

def parse_cookies(cookie_str):
    """Parse 'SESSDATA=xxx; bili_jct=yyy; DedeUserID=zzz' into cookie dicts."""
    cookies = []
    if not cookie_str:
        return cookies
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            name, value = part.split("=", 1)
            cookies.append({
                "name": name.strip(),
                "value": value.strip(),
                "domain": ".bilibili.com"
            })
    return cookies

# ── biliTickerBuy config generator ───────────────────────────────────────────

def generate_btb_config(accounts, tickets, dry_run=False):
    """Generate biliTickerBuy JSON config for each enabled ticket + account pair."""
    section("biliTickerBuy - Generate JSON Config")

    btb_tickets = []
    for ticket in tickets:
        if not ticket.get("enabled", False):
            continue
        tools = ticket.get("tools", [])
        if "biliTickerBuy" not in tools:
            continue
        btb_tickets.append(ticket)

    if not btb_tickets:
        warn("No enabled tickets use biliTickerBuy. Skipping config generation.")
        return

    account_map = {a["name"]: a for a in accounts}

    for ticket in btb_tickets:
        acc_name = ticket.get("account", "")
        acc = account_map.get(acc_name)
        if not acc:
            warn(f"No account '{acc_name}' found for ticket '{ticket['name']}', skipping")
            continue
        cookie_str = acc.get("cookie", "")
        if not cookie_str:
            warn(f"Account '{acc_name}' has no cookie, skipping ticket '{ticket['name']}'")
            continue

        config = {
            "cookies": parse_cookies(cookie_str),
            "detail": ticket.get("name", "Unknown Event"),
            "screen_id": int(ticket.get("screen_id", 0)),
            "project_id": int(ticket.get("project_id", 0)),
            "sku_id": int(ticket.get("sku_id", 0)),
            "pay_money": int(ticket.get("pay_money", 0)),
            "count": int(ticket.get("quantity", 1)),
            "is_hot_project": ticket.get("is_hot_project", False),
            "buyer_info": ticket.get("buyer_info", []),
            "deliver_info": ticket.get("deliver_info", {}),
            "buyer": ticket.get("buyer_info", [{}])[0].get("name", "") if ticket.get("buyer_info") else "",
            "tel": ticket.get("buyer_info", [{}])[0].get("tel", "") if ticket.get("buyer_info") else "",
        }

        # Generate per-ticket config file
        safe_name = ticket["name"].replace(" ", "_").replace("/", "_")
        out_dir = BTB_CONFIG_DIR
        out_file = out_dir / f"{safe_name}.json"

        if dry_run:
            info(f"[DRY RUN] Would generate: {out_file}")
            info(f"  Ticket: {ticket['name']} (account: {acc_name})")
            info(f"  project_id={config['project_id']}, sku_id={config['sku_id']}, "
                 f"count={config['count']}")
        else:
            out_dir.mkdir(parents=True, exist_ok=True)
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=4)
            ok(f"Generated: {out_file}")
            info(f"  Ticket: {ticket['name']} (account: {acc_name})")

    # Also generate a default config.json pointing to first ticket
    if btb_tickets:
        first_ticket = btb_tickets[0]
        acc_name = first_ticket.get("account", "")
        acc = account_map.get(acc_name, accounts[0] if accounts else {})
        cookie_str = acc.get("cookie", "")

        default_config = {
            "cookies": parse_cookies(cookie_str),
            "detail": first_ticket.get("name", "Unknown Event"),
            "screen_id": int(first_ticket.get("screen_id", 0)),
            "project_id": int(first_ticket.get("project_id", 0)),
            "sku_id": int(first_ticket.get("sku_id", 0)),
            "pay_money": int(first_ticket.get("pay_money", 0)),
            "count": int(first_ticket.get("quantity", 1)),
            "is_hot_project": first_ticket.get("is_hot_project", False),
            "buyer_info": first_ticket.get("buyer_info", []),
            "deliver_info": first_ticket.get("deliver_info", {}),
            "buyer": first_ticket.get("buyer_info", [{}])[0].get("name", "") if first_ticket.get("buyer_info") else "",
            "tel": first_ticket.get("buyer_info", [{}])[0].get("tel", "") if first_ticket.get("buyer_info") else "",
        }

        if dry_run:
            info(f"[DRY RUN] Would generate default: {BTB_CONFIG_FILE}")
        else:
            BTB_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            with open(BTB_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(default_config, f, ensure_ascii=False, indent=4)
            ok(f"Generated default config: {BTB_CONFIG_FILE}")

# ── BHYG config generator ───────────────────────────────────────────────────

def generate_bhyg_config(accounts, tickets, dry_run=False):
    """Generate BHYG encrypted AES config file from unified YAML config."""
    section("BHYG - Generate Encrypted Config")

    bhyg_tickets = [t for t in tickets if t.get("enabled", False) and "BHYG" in t.get("tools", [])]
    if not bhyg_tickets:
        warn("No enabled tickets use BHYG. Skipping config generation.")
        return

    bhyg_dir = PROJECT_ROOT / "tools" / "BHYG"
    if not bhyg_dir.exists():
        warn("BHYG directory not found. Run setup first.")
        return

    # Try to import BHYG's encryption modules
    try:
        sys.path.insert(0, str(bhyg_dir))
        from security import get_machine_id
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import pad
        import hashlib
        import json as _json
        has_crypto = True
    except ImportError:
        has_crypto = False
        warn("BHYG crypto modules not available. Generating plaintext config only.")

    account_map = {a["name"]: a for a in accounts}
    config_dir = bhyg_dir / "bhyg_config"

    for ticket in bhyg_tickets:
        acc_name = ticket.get("account", "")
        acc = account_map.get(acc_name, accounts[0] if accounts else {})
        cookie_str = acc.get("cookie", "")

        # Parse cookie to extract individual values
        cookies = {}
        if cookie_str:
            for part in cookie_str.split(";"):
                part = part.strip()
                if "=" in part:
                    k, v = part.split("=", 1)
                    cookies[k.strip()] = v.strip()

        config = {
            "cookie": cookie_str,
            "project_id": int(ticket.get("project_id", 0)),
            "screen_id": int(ticket.get("screen_id", 0)),
            "sku_id": int(ticket.get("sku_id", 0)),
            "count": int(ticket.get("quantity", 1)),
            "pay_money": int(ticket.get("pay_money", 0)),
            "sale_start_time": 0,
            "hotProject": ticket.get("is_hot_project", False),
            "id_bind": False,
            "is_changfan": False,
            "order_type": 1,
            "buyer": "",
            "tel": "",
            "id_buyer": [],
            "version": "3.0",
        }

        # Parse sale_start time
        sale_start = ticket.get("sale_start", "")
        if sale_start:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(sale_start)
                import calendar
                config["sale_start_time"] = int(calendar.timegm(dt.timetuple()))
            except Exception:
                pass

        # Parse buyer info
        buyer_info = ticket.get("buyer_info", [])
        if buyer_info:
            config["buyer"] = buyer_info[0].get("name", "")
            config["tel"] = buyer_info[0].get("tel", "")

        safe_name = ticket['name'].replace(' ', '_').replace('/', '_')

        if dry_run:
            info(f"[DRY RUN] Would generate BHYG config for: {ticket['name']}")
            info(f"  Account: {acc_name}, project_id={config['project_id']}")
            continue

        config_dir.mkdir(parents=True, exist_ok=True)

        if has_crypto:
            # Generate encrypted .sba config
            try:
                machine_id = get_machine_id()
                key = hashlib.md5(machine_id.encode()).hexdigest().encode()[:16]
                cipher = AES.new(key, AES.MODE_CBC, key)
                plaintext = _json.dumps(config)
                encrypted = cipher.encrypt(pad(plaintext.encode(), AES.block_size))
                import base64
                encrypted_b64 = base64.b64encode(encrypted).decode()

                config_file = config_dir / "config.sba"
                with open(config_file, "w", encoding="utf-8") as f:
                    f.write(encrypted_b64)
                ok(f"Generated BHYG encrypted config: {config_file}")
                info(f"  Ticket: {ticket['name']} (account: {acc_name})")
            except Exception as e:
                warn(f"Failed to generate encrypted config: {e}")
                # Fallback to JSON
                config_file = config_dir / f"config_{safe_name}.json"
                with open(config_file, "w", encoding="utf-8") as f:
                    _json.dump(config, f, ensure_ascii=False, indent=2)
                info(f"Generated plaintext JSON: {config_file}")
        else:
            # Generate plaintext JSON as reference
            config_file = config_dir / f"config_{safe_name}.json"
            with open(config_file, "w", encoding="utf-8") as f:
                _json.dump(config, f, ensure_ascii=False, indent=2)
            ok(f"Generated BHYG config reference: {config_file}")
            info(f"  Ticket: {ticket['name']} (account: {acc_name})")
            warn("  This is a plaintext reference. Run BHYG once interactively to encrypt.")

# ── bili_ticket_rush instructions ────────────────────────────────────────────

def print_rush_instructions(tickets):
    """Print setup instructions for bili_ticket_rush (GUI-managed)."""
    section("bili_ticket_rush - Manual GUI Configuration Required")

    rush_tickets = [t for t in tickets if t.get("enabled", False) and "bili_ticket_rush" in t.get("tools", [])]
    if not rush_tickets:
        warn("No enabled tickets use bili_ticket_rush. Skipping.")
        return

    print("""
\033[33m  bili_ticket_rush is a Rust GUI application.\n  Config is managed entirely through its graphical interface.\033[0m

  1. Build the project (if not already built):
     \033[36mcd tools/bili_ticket_rush\033[0m
     \033[36mcargo build --release\033[0m

  2. Run the GUI application:
     \033[36m./target/release/frontend\033[0m

  3. In the GUI:
     - Enter your Bilibili cookie
     - Input project_id, screen_id, sku_id
     - Configure buyer information
     - Set timing and retry parameters

  \033[33m  Note: Requires a display server (X11/Wayland). Cannot run headless.\033[0m
""")

    info("Tickets targeting bili_ticket_rush:")
    for t in rush_tickets:
        print(f"    • {t['name']} (project: {t.get('project_id', '?')}, "
              f"sku: {t.get('sku_id', '?')})")

# ── bili-ticket-go instructions ──────────────────────────────────────────────

def print_btg_instructions(tickets):
    """Print setup instructions for bili-ticket-go (TUI/Web managed)."""
    section("bili-ticket-go - Manual TUI/Web Configuration Required")

    btg_tickets = [t for t in tickets if t.get("enabled", False) and "bili-ticket-go" in t.get("tools", [])]
    if not btg_tickets:
        warn("No enabled tickets use bili-ticket-go. Skipping.")
        return

    print("""
\033[33m  bili-ticket-go uses interactive TUI or Web interface for config.\n  Config cannot be auto-generated from YAML.\033[0m

  1. Run in TUI mode:
     \033[36mcd tools/bili-ticket-go\033[0m
     \033[36m./btg-linux-amd64-static -tui\033[0m

  2. Or run in Web mode (for remote/headless access):
     \033[36m./btg-linux-amd64-static -web -port 8080 -host 0.0.0.0\033[0m
     Then open \033[36mhttp://<server-ip>:8080\033[0m in a browser.

  3. In the TUI/Web interface:
     - Enter your Bilibili cookie
     - Configure target event and ticket details
     - Set buyer information
     - Start the rush process
""")

    info("Tickets targeting bili-ticket-go:")
    for t in btg_tickets:
        print(f"    • {t['name']} (project: {t.get('project_id', '?')}, "
              f"sku: {t.get('sku_id', '?')})")

# ── BHYG env generation ─────────────────────────────────────────────────────

def generate_bhyg_env(accounts, tickets, dry_run=False):
    """Generate BHYG environment config files for scriptable launch."""
    section("BHYG - Generate Environment Config")

    bhyg_tickets = [t for t in tickets if t.get("enabled", False) and "BHYG" in t.get("tools", [])]
    if not bhyg_tickets:
        warn("No enabled tickets use BHYG. Skipping env generation.")
        return

    bhyg_dir = PROJECT_ROOT / "tools" / "BHYG"
    if not bhyg_dir.exists():
        warn("BHYG directory not found. Run setup first.")
        return

    account_map = {a["name"]: a for a in accounts}

    for ticket in bhyg_tickets:
        acc_name = ticket.get("account", "")
        acc = account_map.get(acc_name, accounts[0] if accounts else {})
        cookie = acc.get("cookie", "")

        env_content = f"""# Auto-generated by NyaTicketTools
BHYG_PROJECT_ID={ticket.get('project_id', '')}
BHYG_SCREEN_ID={ticket.get('screen_id', '')}
BHYG_SKU_ID={ticket.get('sku_id', '')}
BHYG_COUNT={ticket.get('quantity', 1)}
BHYG_PAY_MONEY={ticket.get('pay_money', 0)}
BHYG_SALE_TIME={ticket.get('sale_start', '')}
BHYG_COOKIE={cookie}
"""
        safe_name = ticket['name'].replace(' ', '_').replace('/', '_')
        env_file = bhyg_dir / f".env.{safe_name}"

        if dry_run:
            info(f"[DRY RUN] Would generate: {env_file}")
        else:
            with open(env_file, "w", encoding="utf-8") as f:
                f.write(env_content)
            ok(f"Generated BHYG env file: {env_file}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="NyaTickerTools - Generate tool configs from unified YAML"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be generated without writing files")
    parser.add_argument("--config-dir", default=None,
                        help="Override config directory path")
    parser.add_argument("--tool", choices=["biliTickerBuy", "BHYG", "bili_ticket_rush", "bili-ticket-go"],
                        help="Only generate config for specified tool")
    parser.add_argument("--hostname", default=None,
                        help="Override hostname for account assignment")
    args = parser.parse_args()

    print("\033[1;35m")
    print("  ╔══════════════════════════════════════════╗")
    print("  ║   NyaTickerTools - Config Injection      ║")
    print("  ╚══════════════════════════════════════════╝")
    print("\033[0m")

    if args.dry_run:
        warn("DRY RUN mode - no files will be written\n")

    # Override config dir if specified
    global CONFIG_DIR, ACCOUNTS_FILE, TICKETS_FILE, MACHINES_FILE, BTB_CONFIG_DIR, BTB_CONFIG_FILE
    if args.config_dir:
        CONFIG_DIR = Path(args.config_dir)
        ACCOUNTS_FILE = CONFIG_DIR / "accounts.yaml"
        TICKETS_FILE = CONFIG_DIR / "tickets.yaml"
        MACHINES_FILE = CONFIG_DIR / "machines.yaml"
        BTB_CONFIG_DIR = CONFIG_DIR / "generated" / "biliTickerBuy"
        BTB_CONFIG_FILE = BTB_CONFIG_DIR / "config.json"

    # Load configs
    accounts_cfg = load_yaml(ACCOUNTS_FILE, required=True)
    tickets_cfg = load_yaml(TICKETS_FILE, required=True)

    hostname = args.hostname or get_hostname()
    info(f"Current hostname: \033[1m{hostname}\033[0m")

    # Get accounts for this machine
    accounts = get_accounts_for_host(accounts_cfg, hostname)
    info(f"Accounts available on this machine: {len(accounts)}")
    for acc in accounts:
        print(f"    • {acc['name']} (uid: {acc.get('uid', '?')})")

    tickets = tickets_cfg.get("tickets", [])
    enabled_tickets = [t for t in tickets if t.get("enabled", False)]
    info(f"Total tickets configured: {len(tickets)} ({len(enabled_tickets)} enabled)")

    if not enabled_tickets:
        warn("No enabled tickets found. Edit config/tickets.yaml to enable targets.")
        return

    # Generate configs for each tool (filter by --tool if specified)
    if args.tool is None or args.tool == "biliTickerBuy":
        generate_btb_config(accounts, tickets, dry_run=args.dry_run)
    if args.tool is None or args.tool == "BHYG":
        generate_bhyg_config(accounts, tickets, dry_run=args.dry_run)
        generate_bhyg_env(accounts, tickets, dry_run=args.dry_run)
    if args.tool is None or args.tool == "bili_ticket_rush":
        print_rush_instructions(tickets)
    if args.tool is None or args.tool == "bili-ticket-go":
        print_btg_instructions(tickets)

    # Summary
    section("Summary")
    if args.dry_run:
        info("Dry run complete. Re-run without --dry-run to apply changes.")
    else:
        ok("Config injection complete!")
        print(f"\n  Generated configs in: \033[36m{BTB_CONFIG_DIR}/\033[0m")
    print()

if __name__ == "__main__":
    main()
