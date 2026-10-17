import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("ANTHROPIC_API_KEY", "test")


@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    """Every test gets its own databases; nothing touches server/data."""
    from pipeline import accounts, referrals, duel, tribunal
    monkeypatch.setattr(accounts, "DATA", str(tmp_path))
    monkeypatch.setattr(accounts, "DB", str(tmp_path / "kleos.db"))
    monkeypatch.setattr(accounts, "WAITLIST", str(tmp_path / "waitlist.jsonl"))
    monkeypatch.setattr(referrals, "DB", str(tmp_path / "referrals.db"))
    monkeypatch.setattr(duel, "DB", str(tmp_path / "duels.db"), raising=False)
    monkeypatch.setattr(tribunal, "DB", str(tmp_path / "tribunals.db"))
    monkeypatch.delenv("REVENUECAT_SECRET_KEY", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.setenv("KLEOS_DEV_CODES", "1")
    yield tmp_path
