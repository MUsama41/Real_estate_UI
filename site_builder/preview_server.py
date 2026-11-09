import functools
import http.server

from site_builder import config


class PreviewServer:
    """Serves site/ on localhost so absolute links like /pages/about resolve as they do when hosted."""

    def __init__(self, port):
        self.port = port

    def serve_forever(self):
        request_handler = functools.partial(
            http.server.SimpleHTTPRequestHandler, directory=str(config.OUTPUT_DIRECTORY)
        )
        with http.server.ThreadingHTTPServer(("127.0.0.1", self.port), request_handler) as server:
            print("Previewing at http://localhost:%d  (Ctrl+C to stop)" % self.port)
            server.serve_forever()
