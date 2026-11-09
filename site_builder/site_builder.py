import shutil

from site_builder import config
from site_builder.templating import PageSource, TemplateRenderer


class SiteBuilder:
    """Renders every page in src/pages into site/ and copies src/assets alongside."""

    def __init__(self, environment_settings):
        self.renderer = TemplateRenderer(config.SOURCE_DIRECTORY, environment_settings.public_values())

    def build(self):
        if config.OUTPUT_DIRECTORY.exists():
            shutil.rmtree(config.OUTPUT_DIRECTORY)
        config.OUTPUT_DIRECTORY.mkdir(parents=True)
        shutil.copytree(config.SOURCE_ASSETS_DIRECTORY, config.OUTPUT_ASSETS_DIRECTORY)

        layout_text = config.LAYOUT_FILE.read_text(encoding="utf-8")
        built_paths = []
        for page_file in sorted(config.PAGES_DIRECTORY.glob("*.html")):
            page = PageSource(page_file)
            destination = config.OUTPUT_DIRECTORY / page.output_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(self.renderer.render_page(layout_text, page), encoding="utf-8")
            built_paths.append(page.output_path)
        return built_paths
