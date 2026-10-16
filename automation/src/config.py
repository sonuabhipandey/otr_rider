from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "config.yaml"
SESSION_STATE_PATH = PROJECT_ROOT / "auth" / "session_state.json"
DOWNLOADS_DIR = PROJECT_ROOT / "downloads"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"{CONFIG_PATH} not found. Copy config.yaml.example to config.yaml and fill in your values."
        )
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)
