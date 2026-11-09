"""Every path and setting the site build uses. Values that vary per machine come from .env."""
import html
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIRECTORY = PROJECT_ROOT / "src"
PAGES_DIRECTORY = SOURCE_DIRECTORY / "pages"
LAYOUT_FILE = SOURCE_DIRECTORY / "layout.html"
SOURCE_ASSETS_DIRECTORY = SOURCE_DIRECTORY / "assets"
OUTPUT_DIRECTORY = PROJECT_ROOT / "site"
OUTPUT_ASSETS_DIRECTORY = OUTPUT_DIRECTORY / "assets"
ENV_FILE = PROJECT_ROOT / ".env"

# Keys a page template may read through {{ env.KEY }}, with the value used when .env leaves them out.
# Anything else in .env stays out of the HTML.
PUBLIC_ENV_DEFAULTS = {
    "WEB3FORMS_ACCESS_KEY": "",
    "WEB3FORMS_ENDPOINT": "https://api.web3forms.com/submit",
    "LOGIN_URL": "#",
}
DEFAULT_PREVIEW_PORT = 8000


class EnvironmentSettings:
    """Reads KEY=VALUE pairs from .env; real environment variables win over the file."""

    def __init__(self, env_file=ENV_FILE):
        self.values = {}
        if env_file.exists():
            for raw_line in env_file.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                self.values[key.strip()] = value.strip().strip('"')
        # Hosts like Vercel have no .env file, so the public keys must be read from the environment directly.
        overridable_keys = set(self.values)
        overridable_keys.update(PUBLIC_ENV_DEFAULTS)
        overridable_keys.add("PREVIEW_PORT")
        for key in overridable_keys:
            if key in os.environ:
                self.values[key] = os.environ[key]

    def get(self, key, default=""):
        return self.values.get(key, default)

    def public_values(self):
        public = {}
        for key, default in PUBLIC_ENV_DEFAULTS.items():
            value = self.get(key)
            if not value:
                value = default
            public[key] = html.escape(value, quote=True)
        return public

    def preview_port(self):
        configured = self.get("PREVIEW_PORT")
        if configured.isdigit():
            return int(configured)
        return DEFAULT_PREVIEW_PORT
