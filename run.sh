#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="jb-agent-pi"

if command -v docker &>/dev/null; then
    RUNTIME=docker
elif command -v podman &>/dev/null; then
    RUNTIME=podman
else
    echo "Error: neither docker nor podman found" >&2
    exit 1
fi

"$RUNTIME" build -t "$IMAGE_NAME" .

"$RUNTIME" run -it --rm \
    -v "$(pwd)/agent-context:/workspace:Z" \
    -v "$(pwd)/agent-context/pi-config:/root/.pi/agent:Z" \
    -e AI_GATEWAY_API_KEY \
    -w /workspace \
    "$IMAGE_NAME"
