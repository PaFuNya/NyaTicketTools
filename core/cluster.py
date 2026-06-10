#!/usr/bin/env python3
"""
NyaTicketTools - Cluster Manager
SSH-based multi-machine orchestration for the buy engine.
"""

import json
import subprocess
import threading
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"


def load_machines():
    """Load machines.yaml."""
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
    """
    Manages multiple BuyEngine instances across machines via SSH.

    Usage:
        cm = ClusterManager()
        cm.deploy_configs("all")      # rsync configs to all nodes
        cm.start_all()                # start engine on all nodes
        cm.status_all()               # get status from all nodes
        cm.stop_all()                 # stop all nodes when any succeeds
    """

    def __init__(self):
        self.nodes = {}
        self._load_nodes()
        self.on_node_event = None

    def _load_nodes(self):
        """Load machine definitions from machines.yaml."""
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
                "engine_running": False,
                "last_sync": None,
            }

    def _ssh(self, node_name, command, timeout=30):
        """Run a command on a remote node via SSH."""
        node = self.nodes.get(node_name)
        if not node:
            return {"ok": False, "error": f"node not found: {node_name}"}

        ssh_cmd = [
            "ssh",
            "-o", "ConnectTimeout=10",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "BatchMode=yes",
            "-p", str(node["port"]),
            f"{node['user']}@{node['host']}",
            command,
        ]

        try:
            result = subprocess.run(
                ssh_cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return {
                "ok": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "rc": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "SSH timeout"}
        except FileNotFoundError:
            return {"ok": False, "error": "ssh command not found"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _rsync(self, node_name):
        """Rsync project files to a remote node."""
        node = self.nodes.get(node_name)
        if not node:
            return {"ok": False, "error": f"node not found: {node_name}"}

        remote = f"{node['user']}@{node['host']}:{node['remote_path']}"

        rsync_cmd = [
            "rsync", "-avz", "--delete",
            "--exclude", ".git",
            "--exclude", "__pycache__",
            "--exclude", "*.pyc",
            "--exclude", "accounts.yaml",
            "--exclude", "bhyg_config",
            "--exclude", ".env.*",
            "-e", f"ssh -p {node['port']} -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o BatchMode=yes",
            f"{PROJECT_ROOT}/",
            f"{remote}/",
        ]

        try:
            result = subprocess.run(rsync_cmd, capture_output=True, text=True, timeout=60)
            return {"ok": result.returncode == 0, "stdout": result.stdout, "stderr": result.stderr}
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "Rsync timeout"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ---- Public API ----

    def check_node(self, node_name):
        """Check if a node is reachable via SSH."""
        result = self._ssh(node_name, "echo ok", timeout=10)
        if result.get("ok"):
            self.nodes[node_name]["status"] = "online"
        else:
            self.nodes[node_name]["status"] = "offline"
        return result

    def check_all(self):
        """Check all nodes concurrently."""
        threads = []
        for name in self.nodes:
            t = threading.Thread(target=self.check_node, args=(name,))
            t.start()
            threads.append(t)
        for t in threads:
            t.join()
        return self.nodes

    def deploy_configs(self, node_name="all"):
        """Deploy (rsync) project files to node(s)."""
        targets = list(self.nodes.keys()) if node_name == "all" else [node_name]
        results = {}
        for name in targets:
            if self.nodes[name]["status"] != "online":
                self.check_node(name)
            if self.nodes[name]["status"] != "online":
                results[name] = {"ok": False, "error": "node offline"}
                continue
            results[name] = self._rsync(name)
            if results[name].get("ok"):
                self.nodes[name]["last_sync"] = subprocess.run(
                    ["date", "-Iseconds"], capture_output=True, text=True
                ).stdout.strip()
        return results

    def start_node(self, node_name):
        """Start the buy engine on a remote node."""
        node = self.nodes.get(node_name)
        if not node:
            return {"ok": False, "error": f"unknown node: {node_name}"}

        remote_path = node["remote_path"]
        cmd = (
            f"cd {remote_path} && "
            f"python3 -m core.engine start 2>&1"
        )
        result = self._ssh(node_name, cmd, timeout=15)
        if result.get("ok"):
            self.nodes[node_name]["engine_running"] = True
        return result

    def stop_node(self, node_name):
        """Stop the buy engine on a remote node."""
        node = self.nodes.get(node_name)
        if not node:
            return {"ok": False, "error": f"unknown node: {node_name}"}

        remote_path = node["remote_path"]
        cmd = (
            f"cd {remote_path} && "
            f"python3 -c \"from core.engine import get_engine; get_engine().stop()\" 2>&1"
        )
        result = self._ssh(node_name, cmd, timeout=15)
        if result.get("ok"):
            self.nodes[node_name]["engine_running"] = False
        return result

    def start_all(self):
        """Start engine on all online nodes."""
        results = {}
        for name, node in self.nodes.items():
            if node["status"] != "online":
                results[name] = {"ok": False, "error": "node offline"}
                continue
            results[name] = self.start_node(name)
        return results

    def stop_all(self):
        """Stop engine on all nodes."""
        results = {}
        for name, node in self.nodes.items():
            if node.get("engine_running"):
                results[name] = self.stop_node(name)
            else:
                results[name] = {"ok": True, "skipped": True}
        return results

    def status_all(self):
        """Get status from all nodes."""
        results = {}
        for name, node in self.nodes.items():
            results[name] = {
                "name": name,
                "host": node["host"],
                "status": node["status"],
                "engine_running": node.get("engine_running", False),
                "last_sync": node.get("last_sync"),
                "accounts": node.get("accounts", []),
            }
        return results


_cluster = None


def get_cluster():
    """Get or create the singleton cluster manager."""
    global _cluster
    if _cluster is None:
        _cluster = ClusterManager()
    return _cluster
