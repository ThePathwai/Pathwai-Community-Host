"""Compiled audits loader.

Same situation as seed_data.py: the original audits.py source is missing
upstream, only a compiled audits.pyc survived, and it was getting silently
dropped from every deploy by the project's blanket `*pyc*` gitignore rule
(and backend/.dockerignore's `*.pyc`). Renaming the bytecode to
audits_bytecode.bin sidesteps both, and this loader re-exposes it as the
`audits` module exactly as before.
"""
import marshal
from pathlib import Path

_bin_path = Path(__file__).parent / "audits_bytecode.bin"
with open(_bin_path, "rb") as _f:
    _f.read(16)  # skip pyc header: magic(4) + flags(4) + hash/mtime+size(8)
    _code = marshal.load(_f)

exec(_code, globals())
