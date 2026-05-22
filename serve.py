import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, HTTPServer

class Handler(SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        if code == 404:
            self.send_response(302)
            self.send_header("Location", "/")
            self.end_headers()
        else:
            super().send_error(code, message, explain)

if __name__ == "__main__":
    port = 8080
    url = f"http://localhost:{port}"
    print(f"Serving on {url}")
    server = HTTPServer(("", port), Handler)
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
