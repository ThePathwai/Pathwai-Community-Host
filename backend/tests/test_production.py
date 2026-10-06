"""Runs tests/prod_boot_check.py in a fresh interpreter: demo mode is fixed at import time, and the rest
of the suite runs with it ON, so the production configuration needs a process of its own."""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def test_production_mode_boot_and_launch_path():
    env = {**os.environ, "PYTHONPATH": str(HERE.parent)}
    env.pop("DEMO_MODE", None)
    r = subprocess.run([sys.executable, str(HERE / "prod_boot_check.py")], cwd=str(HERE.parent), env=env, capture_output=True, text=True, timeout=240)
    assert r.returncode == 0, r.stdout[-4000:] + r.stderr[-2000:]
