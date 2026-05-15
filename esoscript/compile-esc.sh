#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="${1:-./esc}"

if command -v podman &> /dev/null; then
    podman build --no-cache -t esc-builder -f "$SCRIPT_DIR/Dockerfile.compile-esc" "$SCRIPT_DIR"
    CID=$(podman create esc-builder)
    podman cp "$CID":/esc "$OUTPUT"
    podman rm "$CID"
else
    cargo build --release --manifest-path "$SCRIPT_DIR/Cargo.toml"
    cp "$SCRIPT_DIR/target/release/esc" "$OUTPUT"
fi

chmod +x "$OUTPUT"
echo "esc built: $OUTPUT"
