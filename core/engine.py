#!/usr/bin/env python3
"""
NyaTicketTools - Buy Engine
Manages biliTickerBuy execution with status monitoring and multi-account support.
"""

import json
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
GEN_DIR = CONFIG_DIR / "generated" / "biliTickerBuy"


def load_tickets():
    """Load tickets.yaml."""
    try:
        import yaml
    except ImportError:
        return {}
    path = CONFIG_DIR / "tickets.yaml"
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_accounts():
    """Load accounts.yaml."""
    try:
        import yaml
    except ImportError:
        return []
    path = CONFIG_DIR / "accounts.yaml"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("accounts", [])


class BuyEngine:
    """
    Manages biliTickerBuy execution for a single machine/node.

    Usage:
        engine = BuyEngine()
        engine.on_event = lambda event: print(event)  # status callback
        engine.start(config_path)  # starts biliTickerBuy in background
        engine.stop()              # graceful shutdown
        engine.status              # gets current status
    """

    def __init__(self):
        self._process = None
        self._thread = None
        self._running = False
        self._status = "idle"
        self._started_at = None
        self._last_event = None
        self._log_lines = []
        self._max_log_lines = 200
        self.on_event = None

    @property
    def status(self):
        return {
            "running": self._running,
            "status": self._status,
            "started_at": self._started_at.isoformat() if self._started_at else None,
            "last_event": self._last_event,
            "log_tail": self._log_lines[-20:],
        }

    def start(self, config_path=None, interval=100):
        """Start biliTickerBuy with the given config."""
        if self._running:
            return {"ok": False, "error": "already running"}

        if config_path is None:
            config_path = GEN_DIR / "config.json"

        config_path = Path(config_path)
        if not config_path.exists():
            return {"ok": False, "error": f"config not found: {config_path}"}

        btb_dir = PROJECT_ROOT / "tools" / "biliTickerBuy"
        if not btb_dir.exists():
            return {"ok": False, "error": "biliTickerBuy not installed. Run: ./nyaticket setup"}

        self._log_lines = []
        self._status = "starting"
        self._started_at = datetime.now()
        self._running = True

        self._thread = threading.Thread(
            target=self._run_btb,
            args=(btb_dir, config_path, interval),
            daemon=True,
        )
        self._thread.start()
        return {"ok": True}

    def _run_btb(self, btb_dir, config_path, interval):
        """Run biliTickerBuy CLI in background, monitor stdout."""
        try:
            self._emit("engine_started", f"Starting biliTickerBuy with config: {config_path}")

            self._process = subprocess.Popen(
                [
                    sys.executable, "-m", "biliTickerBuy", "buy",
                    str(config_path),
                    "--interval", str(interval),
                ],
                cwd=str(btb_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            self._status = "running"
            self._emit("engine_running", "biliTickerBuy process started")

            for line in self._process.stdout:
                line = line.rstrip()
                if line:
                    self._log_lines.append(line)
                    if len(self._log_lines) > self._max_log_lines:
                        self._log_lines = self._log_lines[-self._max_log_lines:]

                    self._parse_line(line)

            self._process.wait()
            self._status = "stopped"
            self._emit("engine_stopped", f"biliTickerBuy exited with code {self._process.returncode}")

        except FileNotFoundError:
            self._status = "failed"
            self._emit("engine_error", "biliTickerBuy not found. Install with: pip install bilitickerbuy")
        except Exception as e:
            self._status = "failed"
            self._emit("engine_error", str(e))
        finally:
            self._running = False
            self._process = None

    def _parse_line(self, line):
        """Parse biliTickerBuy output for key events."""
        lower = line.lower()

        if "preparing" in lower or "prepare" in lower:
            self._emit("prepare", line)
        elif "order" in lower and ("create" in lower or "creating" in lower):
            self._emit("order_create", line)
        elif "success" in lower or "succeeded" in lower or "抢票成功" in line:
            self._status = "success"
            self._emit("order_success", line)
        elif "fail" in lower or "error" in lower or "err" in lower:
            self._emit("error", line)
        elif any(w in lower for w in ["retrying", "retry", "重试"]):
            self._emit("retry", line)
        elif "stock" in lower or "库存" in line:
            self._emit("stock_check", line)

    def _emit(self, event_type, message):
        """Emit status event to callback."""
        self._last_event = {"type": event_type, "message": message, "time": datetime.now().isoformat()}
        if self.on_event:
            try:
                self.on_event(self._last_event)
            except Exception:
                pass

    def stop(self):
        """Stop biliTickerBuy gracefully (SIGTERM) then force (SIGKILL)."""
        if not self._running or not self._process:
            return {"ok": False, "error": "not running"}

        try:
            self._process.send_signal(signal.SIGTERM)
            self._emit("engine_stopping", "Sending SIGTERM...")

            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._emit("engine_killed", "Force killed after timeout")

            self._running = False
            self._status = "stopped"
            self._emit("engine_stopped", "Engine stopped")
            return {"ok": True}

        except Exception as e:
            self._status = "error"
            return {"ok": False, "error": str(e)}


_engine = None


def get_engine():
    """Get or create the singleton engine instance."""
    global _engine
    if _engine is None:
        _engine = BuyEngine()
    return _engine
