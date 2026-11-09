"""Builds the static site from src/ into site/.

    python build_site.py            build only
    python build_site.py --serve    build, then preview at http://localhost:PREVIEW_PORT
"""
import sys

from site_builder.config import EnvironmentSettings
from site_builder.preview_server import PreviewServer
from site_builder.site_builder import SiteBuilder


def main():
    environment_settings = EnvironmentSettings()
    for built_path in SiteBuilder(environment_settings).build():
        print("built  site/%s" % built_path)
    if "--serve" in sys.argv:
        PreviewServer(environment_settings.preview_port()).serve_forever()


if __name__ == "__main__":
    main()
