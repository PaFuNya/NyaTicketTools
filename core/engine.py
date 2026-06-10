#!/usr/bin/env python3
"""
NyaTicketTools — Multi-Account Buy Engine
Imports biliTickerBuy directly for ticket purchasing with multi-account support.
"""

import json
import threading
import time
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
BTB_ROOT = PROJECT_ROOT / "tools" / "biliTickerBuy"

# Ensure biliTickerBuy is importable
import sys
sys.path.insert(0, str(BTB_ROOT))


class MultiBuyEngine:
    """
    Multi-account ticket purchasing engine built on biliTickerBuy.

    Usage:
        engine = MultiBuyEngine()
        engine.on_event = lambda evt: print(evt)

        # Setup accounts
        engine.add_account("主号", cookies=[{...}], buyer_info={...}, deliver_info={...})
        engine.add_account("小号", cookies=[{...}], buyer_info={...}, deliver_info={...})

        # Set target
        engine.set_target(project_id=12345, screen_id=67890, sku_id=11111,
                         pay_money=48000, count=1, sale_start="2026-07-01T10:00:00")

        # Start all accounts in parallel
        engine.start_all(interval=100)

        # Event callbacks:
        # "engine_started"  - all accounts launching
        # "account_starting" - individual account starting with task_id
        # "order_success"    - any account succeeded
        # "account_failed"   - an account's buy ended in failure
        # "all_completed"    - all done with summary
    """

    def __init__(self):
        self._accounts = []
        self._target = None
        self._target_options = {}
        self._tasks = {}       # account_name -> task_id
        self._threads = {}     # account_name -> polling thread
        self._running = False
        self._stopped = False
        self._results = {}     # account_name -> task result dict
        self._success_account = None
        self._success_result = None
        self.on_event = None   # callback(evt_dict)
        self._lock = threading.Lock()

    # ── Configuration ────────────────────────────────────────────

    def add_account(self, name, cookies, buyer_info=None, deliver_info=None):
        """Register an account with cookies and optional buyer/deliver info."""
        self._accounts.append({
            "name": name,
            "cookies": cookies,
            "buyer_info": buyer_info or [],
            "deliver_info": deliver_info or {},
        })

    def set_target(self, project_id, screen_id, sku_id, pay_money,
                   count=1, sale_start=None, is_hot_project=False, detail=None):
        """Set the ticket target to buy."""
        self._target = {
            "project_id": int(project_id),
            "screen_id": int(screen_id),
            "sku_id": int(sku_id),
            "pay_money": int(pay_money),
            "count": int(count),
            "is_hot_project": bool(is_hot_project),
            "detail": detail or f"Ticket-{project_id}",
        }
        if sale_start:
            self._target_options["time_start"] = sale_start

    def set_runtime_options(self, interval=100, time_start=None, proxies=None, **notifiers):
        """Set runtime options for the buy engine."""
        self._target_options["interval"] = int(interval)
        if time_start:
            self._target_options["time_start"] = time_start
        if proxies:
            self._target_options["https_proxys"] = proxies
        # Optional notification tokens
        for key in ("pushplusToken", "barkToken", "serverchanKey",
                     "meowNickname", "ntfy_url", "serverchan3ApiUrl"):
            if key in notifiers and notifiers[key]:
                self._target_options[key] = notifiers[key]

    # ── Engine Control ───────────────────────────────────────────

    def start_all(self, interval=100):
        """Start buy for all configured accounts in parallel."""
        if not self._accounts:
            self._emit("engine_error", {"error": "no_accounts", "message": "没有配置账号"})
            return {"ok": False, "error": "no_accounts"}

        if not self._target:
            self._emit("engine_error", {"error": "no_target", "message": "没有设置抢票目标"})
            return {"ok": False, "error": "no_target"}

        self._running = True
        self._stopped = False
        self._success_account = None
        self._success_result = None
        self._results = {}
        self._tasks = {}
        self._threads = {}

        self._emit("engine_started", {
            "accounts": len(self._accounts),
            "target": self._target,
        })

        for acc in self._accounts:
            t = threading.Thread(target=self._run_account, args=(acc, interval), daemon=True)
            t.start()
            self._threads[acc["name"]] = t

        return {"ok": True, "accounts": len(self._accounts)}

    def _run_account(self, account, interval):
        """Run buy for a single account using biliTickerBuy's run_buy_sync."""
        name = account["name"]
        try:
            from biliTickerBuy import run_buy_sync, generate_ticket_config, validate_config

            buyer_info = account.get("buyer_info") or []
            deliver_info = account.get("deliver_info") or {}
            buyer_name = buyer_info[0].get("name", "") if buyer_info else ""
            buyer_tel = deliver_info.get("tel", buyer_info[0].get("tel", "") if buyer_info else "")

            if not buyer_name and deliver_info:
                buyer_name = deliver_info.get("name", "")
            if not buyer_tel and deliver_info:
                buyer_tel = deliver_info.get("tel", "")

            config = {
                "cookies": account["cookies"],
                "detail": self._target["detail"],
                "screen_id": self._target["screen_id"],
                "project_id": self._target["project_id"],
                "sku_id": self._target["sku_id"],
                "pay_money": self._target["pay_money"],
                "count": self._target["count"],
                "buyer": buyer_name,
                "tel": buyer_tel,
                "buyer_info": buyer_info,
                "deliver_info": deliver_info,
                "is_hot_project": self._target.get("is_hot_project", False),
                "username": name,
            }

            self._emit("account_starting", {"account": name})

            result = run_buy_sync(config, runtime_options={
                "interval": interval,
                **self._target_options,
            })

            with self._lock:
                self._results[name] = result
                status = result.get("status", "completed")

                if status == "succeeded" and self._success_account is None:
                    self._success_account = name
                    self._success_result = result
                    self._emit("order_success", {
                        "account": name,
                        "payment_qr_url": result.get("payment_qr_url"),
                        "logs": result.get("logs", [])[-5:],
                    })
                    self.stop_all(silent=True)

                elif not self._stopped:
                    self._emit("account_completed", {
                        "account": name,
                        "status": status,
                        "payment_qr_url": result.get("payment_qr_url"),
                    })

        except Exception as e:
            with self._lock:
                self._results[name] = {"ok": False, "error": str(e)}
                self._emit("account_error", {"account": name, "error": str(e)})

        finally:
            self._check_all_done()

    def _check_all_done(self):
        with self._lock:
            all_done = len(self._results) == len(self._accounts)
        if all_done:
            self._running = False
            success = self._success_account is not None
            self._emit("all_completed", {
                "success": success,
                "success_account": self._success_account,
                "results": {k: v.get("status", v.get("error", "unknown")) for k, v in self._results.items()},
            })

    def stop_all(self, silent=False):
        """Stop all running tasks."""
        self._stopped = True
        self._running = False
        if not silent:
            self._emit("engine_stopped", {"message": "Engine stopped"})

    @property
    def is_running(self):
        return self._running

    @property
    def status(self):
        """Return current engine status."""
        return {
            "running": self._running,
            "accounts_total": len(self._accounts),
            "accounts_done": len(self._results),
            "success": self._success_account is not None,
            "success_account": self._success_account,
            "results": {k: v.get("status", v.get("error", "?")) for k, v in self._results.items()},
        }

    # ── User Info Helpers ────────────────────────────────────────

    @staticmethod
    def verify_cookies(cookies):
        """Verify cookies against Bilibili API. Returns (ok, username, uid)."""
        try:
            from biliTickerBuy import login_with_cookies
            result = login_with_cookies(cookies)
            if result.get("ok") and result.get("logged_in"):
                return True, result.get("username", ""), ""
            return False, "", ""
        except Exception as e:
            return False, "", str(e)

    @staticmethod
    def fetch_user_info(cookies):
        """Fetch user buyers and addresses. Returns {buyers: [...], addresses: [...]}."""
        try:
            from biliTickerBuy import fetch_buyers, fetch_addresses
            buyers_result = fetch_buyers(cookies=cookies)
            addresses_result = fetch_addresses(cookies=cookies)
            return {
                "ok": True,
                "buyers": buyers_result.get("buyers", []),
                "addresses": addresses_result.get("addresses", []),
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def fetch_project_detail(project_input, cookies=None):
        """Fetch project detail from Bilibili."""
        try:
            from biliTickerBuy import fetch_project_detail
            return {"ok": True, "data": fetch_project_detail(project_input, cookies=cookies)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def fetch_purchase_context(project_input, cookies=None):
        """Fetch full purchase context (project + options + buyers + addresses)."""
        try:
            from biliTickerBuy import fetch_purchase_context
            return {"ok": True, "data": fetch_purchase_context(project_input, cookies=cookies)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def start_qr_login(qr_image_path=None):
        """Start QR code login flow. Returns {qrcode_key, login_url, qr_image_path}."""
        try:
            from biliTickerBuy import start_qr_login
            result = start_qr_login(qr_image_path=qr_image_path)
            return result
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def poll_qr_login(qrcode_key, timeout=120):
        """Poll QR login status until confirmed or timeout."""
        try:
            from biliTickerBuy import poll_qr_login
            result = poll_qr_login(qrcode_key, timeout_seconds=timeout)
            return result
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def validate_config(config):
        """Validate a ticket config dict."""
        try:
            from biliTickerBuy import validate_config
            result = validate_config(config)
            return result.to_dict()
        except Exception as e:
            return {"ok": False, "errors": [str(e)]}

    # ── Internal ──────────────────────────────────────────────────

    def _emit(self, event_type, data=None):
        """Emit an engine event."""
        evt = {
            "type": event_type,
            "time": datetime.now().isoformat(),
            "data": data or {},
            "status": self.status,
        }
        if self.on_event:
            try:
                self.on_event(evt)
            except Exception:
                pass


_engine = None


def get_engine():
    """Get or create the singleton engine instance."""
    global _engine
    if _engine is None:
        _engine = MultiBuyEngine()
    return _engine


def reset_engine():
    """Reset the engine for a new buying session."""
    global _engine
    _engine = MultiBuyEngine()
    return _engine
