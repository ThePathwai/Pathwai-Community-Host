"""Compiled seed-data loader.

The original seed_data.py source is missing upstream; only a compiled
seed_data.pyc survived. That bare .pyc kept getting silently dropped from
every deploy because the project's root .gitignore has a blanket `*pyc*`
rule (and backend/.dockerignore excludes `*.pyc` too), so the module never
shipped to Railway even though it worked locally. Renaming the bytecode to
seed_data_bytecode.bin sidesteps both ignore rules, and this tiny loader
re-exposes it as the `seed_data` module exactly as before.
"""
import marshal
from pathlib import Path

_bin_path = Path(__file__).parent / "seed_data_bytecode.bin"
with open(_bin_path, "rb") as _f:
    _f.read(16)  # skip pyc header: magic(4) + flags(4) + hash/mtime+size(8)
    _code = marshal.load(_f)

exec(_code, globals())
