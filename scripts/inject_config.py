#!/usr/bin/env python3
"""
NyaTicketTools - Config Generator
Reads accounts.yaml + tickets.yaml, generates biliTickerBuy JSON config.

Usage:
    python3 inject_config.py [--dry-run] [--config-dir DIR]
"""

import argparse
import json
import platform
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML not installed. Run: pip3 install pyyaml")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

OK = "\033[32m✓\033[0m"
WARN = "\033[33m⚠\033[0m"
ERR = "\033[31m✗\033[0m"
INFO = "\033[34mℹ\033[0m"


def parse_cookies(cookie_str):
    """Parse 'SESSDATA=xxx; bili_jct=yyy; DedeUserID=zzz' into biliTickerBuy format."""
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
                "domain": ".bilibili.com",
            })
    return cookies


def main():
    parser = argparse.ArgumentParser(description="Generate biliTickerBuy configs from YAML")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--config-dir", default=None)
    args = parser.parse_args()

    config_dir = Path(args.config_dir) if args.config_dir else PROJECT_ROOT / "config"
    accounts_file = config_dir / "accounts.yaml"
    tickets_file = config_dir / "tickets.yaml"

    accounts_cfg = yaml.safe_load(open(accounts_file, "r")) if accounts_file.exists() else {}
    tickets_cfg = yaml.safe_load(open(tickets_file, "r")) if tickets_file.exists() else {}
    tickets = tickets_cfg.get("tickets", [])
    accounts = accounts_cfg.get("accounts", [])

    if not accounts:
        print(f"{ERR} No accounts found in {accounts_file}")
        return
    if not tickets:
        print(f"{ERR} No tickets found in {tickets_file}")
        return

    account_map = {a["name"]: a for a in accounts}

    started = False
    for ticket in tickets:
        if not ticket.get("enabled", False):
            continue

        acc_name = ticket.get("account", "")
        acc = account_map.get(acc_name)
        if not acc:
            print(f"{WARN} Account '{acc_name}' not found for '{ticket.get('name', '?')}'")
            continue

        cookie_str = acc.get("cookie", "")
        if not cookie_str:
            print(f"{WARN} Account '{acc_name}' has no cookie, skipping '{ticket.get('name', '?')}'")
            continue

        config = {
            "cookies": parse_cookies(cookie_str),
            "detail": ticket.get("name", "Unknown"),
            "screen_id": int(ticket.get("screen_id", 0)),
            "project_id": int(ticket.get("project_id", 0)),
            "sku_id": int(ticket.get("sku_id", 0)),
            "pay_money": int(ticket.get("pay_money", 0)),
            "count": int(ticket.get("quantity", 1)),
            "is_hot_project": ticket.get("is_hot_project", False),
            "buyer_info": ticket.get("buyer_info", []),
            "deliver_info": ticket.get("deliver_info", {}),
        }

        out_dir = config_dir / "generated" / "biliTickerBuy"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "config.json"

        if args.dry_run:
            print(f"{INFO} [DRY RUN] Would generate: {out_file}")
            print(f"  Ticket: {ticket['name']} (account: {acc_name})")
        else:
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=4)
            print(f"{OK} Generated: {out_file}")
            started = True

    if not started:
        print(f"{WARN} No enabled tickets found. Enable a ticket in {tickets_file}")
        print("  Set 'enabled: true' on at least one entry.")


if __name__ == "__main__":
    main()
