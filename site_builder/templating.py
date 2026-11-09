"""Turns src/ page files into finished HTML.

Syntax understood in layout, pages and partials:
  {% include "partials/name.html" %}   inline another file from src/
  {{ env.KEY }}                         a public value from .env
  {{ page.key }}                        a value from the page's front matter
  {{ nav_current:/path }}               aria-current="page" when the page's nav_path is /path
"""
import re

INCLUDE_PATTERN = re.compile(r'{%\s*include\s+"([^"]+)"\s*%}')
VALUE_PATTERN = re.compile(r"{{\s*(env|page)\.([A-Za-z0-9_]+)\s*}}")
NAV_CURRENT_PATTERN = re.compile(r"{{\s*nav_current:(\S+?)\s*}}")
FRONT_MATTER_PATTERN = re.compile(r"\A<!--page\s*\n(.*?)\n-->\s*\n", re.S)
AFTER_FOOTER_MARKER = "<!--after-footer-->"
MAX_INCLUDE_DEPTH = 5


class PageSource:
    """One file in src/pages: front matter (key: value lines) followed by the page body."""

    def __init__(self, path):
        self.path = path
        text = path.read_text(encoding="utf-8")
        match = FRONT_MATTER_PATTERN.match(text)
        if not match:
            raise ValueError("%s is missing its <!--page ... --> front matter" % path.name)
        self.settings = {}
        for line in match.group(1).splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                self.settings[key.strip()] = value.strip()
        body = text[match.end():]
        # Anything after this marker renders below the footer (e.g. page-specific style overrides).
        if AFTER_FOOTER_MARKER in body:
            self.body, self.after_footer = body.split(AFTER_FOOTER_MARKER, 1)
        else:
            self.body = body
            self.after_footer = ""

    @property
    def output_path(self):
        return self.settings["output"]


class TemplateRenderer:
    def __init__(self, source_directory, public_env_values):
        self.source_directory = source_directory
        self.public_env_values = public_env_values

    def render_page(self, layout_text, page):
        document = layout_text.replace("{{ content }}", page.body)
        document = document.replace("{{ after_footer }}", page.after_footer)
        document = self.expand_includes(document, depth=0)
        document = self.fill_values(document, page)
        document = self.mark_current_navigation(document, page.settings.get("nav_path", ""))
        return document

    def expand_includes(self, text, depth):
        if depth > MAX_INCLUDE_DEPTH:
            raise RecursionError("Includes nested deeper than %d levels" % MAX_INCLUDE_DEPTH)
        if not INCLUDE_PATTERN.search(text):
            return text
        expanded = INCLUDE_PATTERN.sub(self.read_include, text)
        return self.expand_includes(expanded, depth + 1)

    def read_include(self, match):
        return (self.source_directory / match.group(1)).read_text(encoding="utf-8")

    def fill_values(self, text, page):
        def replace_value(match):
            scope, key = match.group(1), match.group(2)
            if scope == "env":
                if key not in self.public_env_values:
                    raise KeyError("{{ env.%s }} is not listed in PUBLIC_ENV_DEFAULTS" % key)
                return self.public_env_values[key]
            if key not in page.settings:
                raise KeyError("%s uses {{ page.%s }} but does not define it" % (page.path.name, key))
            return page.settings[key]

        return VALUE_PATTERN.sub(replace_value, text)

    def mark_current_navigation(self, text, current_path):
        def replace_marker(match):
            if match.group(1) == current_path:
                return 'aria-current="page"'
            return ""

        return NAV_CURRENT_PATTERN.sub(replace_marker, text)
