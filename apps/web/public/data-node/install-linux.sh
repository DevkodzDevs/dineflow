#!/usr/bin/env bash
# DineFlow data node — Linux install (0173). From the folder that holds dineflow-data-node.mjs and .env:
#   sudo bash install-linux.sh
# Checks Node 20+, tests the connection, and installs a systemd service that starts at boot and restarts if it stops.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js is not installed. Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"; exit 1; }
V="$("$NODE" -v | sed -E 's/^v([0-9]+).*/\1/')"; [ "$V" -ge 20 ] || { echo "Node.js $V is too old — 20 or newer is needed."; exit 1; }
[ -f "$HERE/.env" ] || { echo "No .env beside this script. Paste the one Master control showed when you added the server."; exit 1; }
echo "Testing the connection..."; "$NODE" "$HERE/dineflow-data-node.mjs" --check
RUN_USER="${SUDO_USER:-$(id -un)}"
cat > /etc/systemd/system/dineflow-data-node.service <<EOF
[Unit]
Description=DineFlow data node (backups on this machine)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$HERE
ExecStart=$NODE $HERE/dineflow-data-node.mjs
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable --now dineflow-data-node
echo "Done. Status: systemctl status dineflow-data-node · Log: $HERE/dineflow-backups/node.log"
