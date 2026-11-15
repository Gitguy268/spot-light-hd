#!/bin/sh
# Double-click to play with offline support (a local web server). Opening index.html directly
# also works; only the offline install (service worker) needs a server.
cd "$(dirname "$0")" || exit 1
PORT=5192
( sleep 1; open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
