#!/usr/bin/env python3
"""Run synthetic PDCA adapter checks in an owned disposable Python environment."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
base = Path(tempfile.mkdtemp(prefix='hermes-pdca-check-', dir='/tmp'))
env = {k: v for k, v in os.environ.items() if not k.startswith(('PIP_', 'PYTHONPATH', 'PYTHONHOME'))}
env.update(PYTHONDONTWRITEBYTECODE='1', PYTHONNOUSERSITE='1', PIP_CONFIG_FILE=os.devnull)
try:
    subprocess.run([sys.executable, '-m', 'venv', str(base / 'venv')], check=True, env=env, timeout=60)
    python = base / 'venv' / 'bin' / 'python'
    subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check',
                    '--index-url', 'https://pypi.org/simple', '-r', str(root / 'hermes/requirements-runtime.txt')],
                   check=True, cwd=root, env=env, timeout=240)
    subprocess.run([str(python), '-m', 'unittest', 'discover', '-s', 'hermes/tests',
                    '-p', 'test_pdca*.py', '-v'], check=True, cwd=root, env=env, timeout=180)
finally:
    shutil.rmtree(base)
    print('Owned synthetic Hermes test environment removed', flush=True)
