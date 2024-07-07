#!/usr/bin/env python3

import argparse
import http.server
import datetime
import email
from http.server import HTTPStatus
import io
import os
import pathlib
import posixpath
import subprocess
import urllib
import urllib.parse
import sys

class HTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    url_prefix_dir_map = {}
    base_dir = None

    def handle(self):
        try:
            http.server.SimpleHTTPRequestHandler.handle(self)
        except ConnectionResetError:
            # This is business as usual when you have persistent connections.
            pass

    def translate_path(self, path):
        """Translate a /-separated PATH to the local filename syntax.

        Components that mean special things to the local file system
        (e.g. drive or directory names) are ignored.  (XXX They should
        probably be diagnosed.)

        """
        # abandon query parameters
        path = path.split('?',1)[0]
        path = path.split('#',1)[0]
        # Don't forget explicit trailing slash when normalizing. Issue17324
        trailing_slash = path.rstrip().endswith('/')
        try:
            path = urllib.parse.unquote(path, errors='surrogatepass')
        except UnicodeDecodeError:
            path = urllib.parse.unquote(path)

        base_dir = self.base_dir
        for prefix, path_override in sorted(self.url_prefix_dir_map.items(), reverse=True):
            if path.startswith(prefix):
                path = path[len(prefix):]
                base_dir = path_override
                break
        path = posixpath.normpath(path)
        words = path.split('/')
        words = filter(None, words)
        path = base_dir
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                # Ignore components that are not a simple file/directory name
                continue
            path = os.path.join(path, word)
        if trailing_slash:
            path += '/'
        return path


    def do_PUT(self):
        # Only write if an identity provided in the header. Generally this comes
        # from the client certificate subject name.
        if '@' not in self.headers.get("Client-Cert-Subject", ""):
            self.close_connection = True
            self.send_response(401, "Not Authorized")
            self.wfile.write("PUT not allowed on a directory without client cert\n".encode())
            return

        # only write file to our "data" directories - yes this is shitty.
        tpath = self.translate_path(self.path)

        if os.path.basename(os.path.dirname(tpath)) != "data":
            self.close_connection = True
            self.send_response(405, "Method Not Allowed")
            self.wfile.write(
                "PUT allowed only in an explicit data directory\n".encode()
            )
            return

        uri = urllib.parse.urlparse(self.path)
        qargs = urllib.parse.parse_qs(uri.query, keep_blank_values=True)


        path = pathlib.Path(self.base_dir) / self.translate_path(self.path)
        if not path:
            self.close_connection = True
            self.send_response(405, "Method Not Allowed")
            self.wfile.write("PUT not allowed on a directory\n".encode())
            return

        response = (201, "Created")
        if path.exists():
            response = (204, "No Content")

        # Read content-length or up to a megabyte.
        length = int(self.headers.get("Content-Length", 1024 * 1024))
        with open(path, "wb") as f:
            f.write(self.rfile.read(length))

        if qargs.get("commit"):
            # git add ./data/$name
            # git commit -m "autocommit ./data/$name" ./data/$name
            try:
                env = {
                    'GIT_AUTHOR_NAME': 'Dr Robotnik',
                    'GIT_AUTHOR_EMAIL': 'dr.robotnick@localhost',
                    'GIT_COMMITTER_NAME': 'Dr Robotnik',
                    'GIT_COMMITTER_EMAIL': 'dr.robotnick@localhost',
                }
                subprocess.check_output(['git', 'add', path], env=env, stderr=subprocess.PIPE)
                subprocess.check_output(['git', 'commit', '-m', 'autocommit '+str(path), path], env=env, stderr=subprocess.PIPE)
            except subprocess.CalledProcessError as e:
                self.close_connection = True
                self.send_response(500, 'Internal Server Error')
                self.wfile.write(b"Error committing new version.\n" + e.stderr)
                # NOTE(msolo) Nothing demonstrates the overwhelming sadness of
                # Python3 like two adjacent calls to "write" functions that have
                # exactly opposite and indecipherable semantics.
                sys.stderr.write(e.stderr.decode('utf8'))
                return

        self.send_response(*response)
        self.end_headers()

    def list_directory(self, path):
        """Helper to produce a directory listing (absent index.html).

        Return value is either a file object, or None (indicating an
        error).  In either case, the headers are sent, making the
        interface the same as for send_head().

        """
        try:
            list = os.listdir(path)
        except OSError:
            self.send_error(
                http.server.HTTPStatus.NOT_FOUND, "No permission to list directory"
            )
            return None
        list.sort(key=lambda a: a.lower())
        enc = sys.getfilesystemencoding()
        encoded = "\n".join(list).encode(enc, "surrogateescape")
        f = io.BytesIO()
        f.write(encoded)
        f.write(b"\n")
        size = f.tell()
        f.seek(0)
        self.send_response(http.server.HTTPStatus.OK)
        self.send_header("Content-type", "text/html; charset=%s" % enc)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        return f

    def send_head(self):
        """Common code for GET and HEAD commands.

        This sends the response code and MIME headers.

        Return value is either a file object (which has to be copied
        to the outputfile by the caller unless the command was HEAD,
        and must be closed by the caller under all circumstances), or
        None, in which case the caller has nothing further to do.

        """
        versioned_request = False
        parts = urllib.parse.urlsplit(self.path)
        if parts[0].startswith('v-'):
            self.path = parts[1:].join('/')
            versioned_request = True

        path = self.translate_path(self.path)
        f = None
        if os.path.isdir(path):
            parts = urllib.parse.urlsplit(self.path)
            if not parts.path.endswith("/"):
                # redirect browser - doing basically what apache does
                self.send_response(HTTPStatus.MOVED_PERMANENTLY)
                new_parts = (parts[0], parts[1], parts[2] + "/", parts[3], parts[4])
                new_url = urllib.parse.urlunsplit(new_parts)
                self.send_header("Location", new_url)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            for index in "index.html", "index.htm":
                index = os.path.join(path, index)
                if os.path.exists(index):
                    path = index
                    break
            else:
                return self.list_directory(path)
        self.extensions_map['.html'] = 'text/html; charset=utf-8'
        ctype = self.guess_type(path)
        # check for trailing "/" which should return 404. See Issue17324
        # The test for this was added in test_httpserver.py
        # However, some OS platforms accept a trailingSlash as a filename
        # See discussion on python-dev and Issue34711 regarding
        # parseing and rejection of filenames with a trailing slash
        if path.endswith("/"):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        try:
            fs = os.fstat(f.fileno())
            # Use browser cache if possible
            if (
                "If-Modified-Since" in self.headers
                and "If-None-Match" not in self.headers
            ):
                # compare If-Modified-Since and time of last file modification
                try:
                    ims = email.utils.parsedate_to_datetime(
                        self.headers["If-Modified-Since"]
                    )
                except (TypeError, IndexError, OverflowError, ValueError):
                    # ignore ill-formed values
                    pass
                else:
                    if ims.tzinfo is None:
                        # obsolete format with no timezone, cf.
                        # https://tools.ietf.org/html/rfc7231#section-7.1.1.1
                        ims = ims.replace(tzinfo=datetime.timezone.utc)
                    if ims.tzinfo is datetime.timezone.utc:
                        # compare to UTC datetime of last modification
                        last_modif = datetime.datetime.fromtimestamp(
                            fs.st_mtime, datetime.timezone.utc
                        )
                        # remove microseconds, like in If-Modified-Since
                        last_modif = last_modif.replace(microsecond=0)

                        if last_modif <= ims:
                            self.send_response(HTTPStatus.NOT_MODIFIED)
                            self.end_headers()
                            f.close()
                            return None

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-type", ctype)
            self.send_header("Content-Length", str(fs[6]))

            # FIXME(msolo) Copy/paste this server code because there is no good way to disable caching.

            uri = urllib.parse.urlparse(self.path)
            qargs = urllib.parse.parse_qs(uri.query, keep_blank_values=True)
            if (qargs.get("v") or versioned_request) and not path.endswith(".mdr"):
                nearly_forever = 24 * 3600 * 7 * 8  # two months
                self.send_header(
                    "Cache-Control",
                    f"max-age={nearly_forever}, stale-if-error={nearly_forever}",
                )
            elif path.endswith(".mdr"):
                # Let's try to fallback to stale if we are offline - not sure this will work.
                nearly_forever = 24 * 3600 * 7 * 8  # two months
                self.send_header(
                    "Cache-Control",
                    f"max-age=1, stale-if-error={nearly_forever}",
                )
            else:
                self.send_header("Cache-Control", "no-cache")

            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            return f
        except:
            f.close()
            raise

ARGS = None
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--bind",
        "-b",
        default="0.0.0.0",
        metavar="ADDRESS",
        help="Specify alternate bind address " "[default: all interfaces]",
    )
    parser.add_argument(
        "--port",
        action="store",
        default=8000,
        type=int,
        help="Specify alternate port [default: 8000]",
    )
    parser.add_argument(
        "--allow-unauthenticated-writes",
        action="store_true",
        help="Disable the header check for a certifice-based identity.",
    )
    parser.add_argument(
        "--data-path",
        default="./data",
        help="Data path for recipes.",
    )

    ARGS = parser.parse_args()

    HTTPRequestHandler.base_dir = "."

    if ARGS.data_path:
        HTTPRequestHandler.url_prefix_dir_map['/data/'] = "/data"

    print("start server: path", ARGS.data_path, file=sys.stderr)
    http.server.test(
        HandlerClass=HTTPRequestHandler,
        # # The default is threaded, which helps almost noone, but is sort of demanded by browsers.
        # ServerClass=http.server.HTTPServer,
        protocol="HTTP/1.1",  # set protocol so Expect-100 works
        port=ARGS.port,
        bind=ARGS.bind,
    )
