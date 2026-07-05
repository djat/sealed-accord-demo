#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Sealed Accord demo → http://localhost:5178"
python3 -m http.server 5178
