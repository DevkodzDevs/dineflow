#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required → https://nodejs.org"; open https://nodejs.org; read -p "Press Enter"; exit 1; }
node launcher.mjs "$@"
