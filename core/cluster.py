#!/usr/bin/env python3
"""
NyaTicketTools — Cluster Manager
Manages worker agents across multiple VPS nodes via SSH + HTTP.

Usage:
    cm = ClusterManager()
    cm.deploy_all()       # rsync config to all workers
    cm.start_workers()    # SSH-start worker agents on all nodes
    cm.status_all()       # HTTP poll all workers for status
    cm.start_buy_all()    # Tell all workers to start buying
    cm.stop_buy_all()     # Tell all workers to stop buying
"""

import json
import subprocess
import threading
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"


def load_machines():
    try:
        import yaml
    except ImportError:
        return {}
    path = CONFIG_DIR / "machines.yaml"
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("machines", {})


class ClusterManager:
    def __init__(self):
        self.nodes = {}
        self._load_nodes()
        self.worker_port = 8800
        self.on_node_event = None

    def _load_nodes(self):
        machines = load_machines()
        for name, cfg in machines.items():
            self.nodes[name] = {
                "name": name,
                "host": cfg.get("host", ""),
                "user": cfg.get("user", "root"),
                "port": cfg.get("port", 22),
                "remote_path": cfg.get("remote_path", "/opt/NyaTicketTools"),
                "accounts": cfg.get("accounts", []),
                "status": "unknown",
                "worker_running": False,
                "engine_running": False,
                "engine_status": {},
                "last_sync": None,
            }

    def _ssh(self, node_name, command, timeout=30):
        node = self.nodes.get(node_name)
        if not node:
            return {"ok": False, "error": f"node not found: {node_name}"}
        cmd = [
            "ssh", "-o", "ConnectTimeout=10",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "BatchMode=yes",
            "-p", str(node["port"]),
            f"{node['user']}@{node['host']}",
            command,
        ]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return {"ok": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr, "rc": r.returncode}
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "SSH timeout"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _rsync(self, node_name):
        node = self.nodes.get(node_name)
        if not node:
            return {"ok": False, "error": f"unknown node: {node_name}"}
        remote = f"{node['user']}@{node['host']}:{node['remote_path']}"
        cmd = [
            "rsync", "-avz", "--delete",
            "--exclude", ".git", "--exclude", "__pycache__", "--exclude", "*.pyc",
            "--exclude", "tools/biliTickerBuy", "--exclude", "bhyg_config", "--exclude", ".env.*",
            "-e", f"ssh -p {node['port']} -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o BatchMode=yes",
            f"{PROJECT_ROOT}/", f"{remote}/",
        ]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if r.returncode == 0:
                node["last_sync"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            return {"ok": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _http_get(self, node_name, path):
        node = self.nodes.get(node_name)
        if not node or node["status"] != "online":
            return None
        try:
            url = f"http://{node['host']}:{self.worker_port}{path}"
            req = Request(url)
            with urlopen(req, timeout=5) as resp:
                return json.loads(resp.read())
        except Exception:
            return None

    def _http_post(self, node_name, path, data=None):
        node = self.nodes.get(node_name)
        if not node or node["status"] != "online":
            return None
        try:
            url = f"http://{node['host']}:{self.worker_port}{path}"
            body = json.dumps(data or {}, ensure_ascii=False).encode("utf-8")
            req = Request(url, data=body, headers={"Content-Type": "application/json"})
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ── Public API ──────────────────────────────────────────

    def check_node(self, node_name):
        node = self.nodes.get(node_name)
        if not node:
            return False
        result = self._ssh(node_name, "echo ok", timeout=10)
        if result.get("ok"):
            node["status"] = "online"
            # Check if worker agent is running
            r = self._ssh(node_name, f"curl -s http://localhost:{self.worker_port}/status", timeout=5)
            node["worker_running"] = r.get("ok", False) and '"engine"' in r.get("stdout", "")
        else:
            node["status"] = "offline"
            node["worker_running"] = False
        return node["status"] == "online"

    def check_all(self):
        threads = [threading.Thread(target=self.check_node, args=(n,)) for n in self.nodes]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return self.nodes

    def deploy_all(self):
        """Rsync project files (except tools/) to all nodes."""
        results = {}
        for name in self.nodes:
            results[name] = self._rsync(name)
        return results

    def start_workers(self):
        """Start worker agents on all remote nodes via SSH."""
        results = {}
        for name, node in self.nodes.items():
            if node["status"] != "online":
                self.check_node(name)
            if node["status"] != "online":
                results[name] = {"ok": False, "error": "node offline"}
                continue

            rp = node["remote_path"]
            cmd = (
                f"cd {rp} && "
                f"nohup python3 core/worker.py --port {self.worker_port}"
                f" > /tmp/nyaticket-worker-{name}.log 2>&1 &"
                f"echo $!"
            )
            r = self._ssh(name, cmd, timeout=10)
            if r.get("ok"):
                node["worker_running"] = True
                results[name] = {"ok": True, "pid": r["stdout"].strip()}
            else:
                results[name] = r
        return results

    def stop_workers(self):
        """Kill worker agents on all nodes."""
        results = {}
        for name in self.nodes:
            r = self._ssh(name, f"pkill -f 'core/worker.py'", timeout=10)
            results[name] = {"ok": True, "killed": r.get("rc", 1) == 0}
            self.nodes[name]["worker_running"] = False
        return results

    def start_buy_all(self, accounts=None, target=None, interval=100):
        """Send buy start command to all online workers."""
        results = {}
        for name, node in self.nodes.items():
            if not node.get("worker_running"):
                results[name] = {"ok": False, "error": "worker not running"}
                continue

            # If no explicit accounts/target, workers use their local configs
            # The worker has generate_btb_config() which reads YAML
            if accounts is None:
                r = self._http_post(name, "/config/generate")
                if not r or not r.get("ok"):
                    # Worker auto-generates from local YAML, then start
                    pass

            r = self._http_post(name, "/buy/start", data={
                "accounts": accounts or [],
                "target": target or {},
                "interval": interval,
            })
            results[name] = r or {"ok": False, "error": "no response"}
            if r and r.get("ok"):
                node["engine_running"] = True
        return results

    def stop_buy_all(self):
        """Send buy stop to all online workers."""
        results = {}
        for name in self.nodes:
            r = self._http_post(name, "/buy/stop")
            results[name] = r or {"ok": False}
            if r and r.get("ok"):
                self.nodes[name]["engine_running"] = False
        return results

    def status_all(self):
        """Poll all workers for current status."""
        results = {}
        for name, node in self.nodes.items():
            s = self._http_get(name, "/status")
            if s:
                node["engine_running"] = s.get("engine", {}).get("running", False)
                node["engine_status"] = s.get("engine", {})
                results[name] = {
                    "name": name, "host": node["host"],
                    "status": node["status"], "worker_running": node.get("worker_running", False),
                    "engine_running": node["engine_running"],
                    "engine": s.get("engine", {}),
                    "uptime": s.get("uptime", 0),
                    "last_sync": node.get("last_sync"),
                    "accounts": node.get("accounts", []),
                }
            else:
                results[name] = {
                    "name": name, "host": node["host"],
                    "status": node["status"], "worker_running": node.get("worker_running", False),
                    "engine_running": False, "engine": {},
                    "last_sync": node.get("last_sync"),
                    "accounts": node.get("accounts", []),
                }
        return results

    def full_deploy_and_start(self, accounts=None, target=None):
        """One-shot: deploy configs, start workers, start buying."""
        results = {"deploy": self.deploy_all(), "workers": {}, "buy": {}}
        # Wait a moment for rsync to complete before starting
        time.sleep(2)
        results["workers"] = self.start_workers()
        time.sleep(3)
        results["buy"] = self.start_buy_all(accounts=accounts, target=target)
        return results


_cluster = None


def get_cluster():
    global _cluster
    if _cluster is None:
        _cluster = ClusterManager()
    return _cluster
