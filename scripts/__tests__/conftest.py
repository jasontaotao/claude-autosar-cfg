"""scripts/__tests__/conftest.py — pytest path setup for tier3_push tests.

Pytest 9 (importlib-mode) collects scripts/__tests__/tier3_push.test.py
as the module scripts.__tests__.tier3_push.test. The script under test
lives at scripts/tier3_push.py (a top-level module within scripts/),
which is not a package (no scripts/__init__.py). To make
`import tier3_push` resolve from the test, expose the scripts/
directory on sys.path via this conftest.
"""
import sys
from pathlib import Path

# Add scripts/ to sys.path so `import tier3_push` resolves inside the
# test module even though scripts/ is not an __init__-bearing package.
_SCRIPTS_DIR = str(Path(__file__).resolve().parent.parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)
