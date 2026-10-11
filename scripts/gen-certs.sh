#!/usr/bin/env bash
# Generate a self-signed TLS certificate for local / development Docker deployments.
#
# Usage:
#   bash scripts/gen-certs.sh [CN]
#
# CN defaults to "localhost". Pass your server's IP or domain as the first
# argument if you want the certificate to cover it (e.g. bash scripts/gen-certs.sh 192.168.1.10).
#
# Output: certs/cert.pem and certs/key.pem
#
# NOTE: This script is intentionally minimal. For production use, replace the
# generated files with a real certificate from Let's Encrypt or another CA.
# The self-signed cert will trigger browser security warnings unless you add it
# to your system's trusted certificate store.
#
# Cloud platforms (Vercel, Railway, Render, Fly.io, etc.) terminate TLS for you
# at their edge — you do NOT need this script for those deployments. Only use
# it for self-hosted / bare-metal / VPS Docker setups.

set -euo pipefail

CN="${1:-localhost}"
CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found — attempting to install..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y openssl
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y openssl
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y openssl
  elif command -v brew >/dev/null 2>&1; then
    brew install openssl
  else
    echo "ERROR: Could not install openssl automatically. Install it manually and retry." >&2
    exit 1
  fi
fi

mkdir -p "$CERTS_DIR"

# Check if certs already exist and are still valid (not expiring within 30 days).
if [[ -f "$CERTS_DIR/cert.pem" && -f "$CERTS_DIR/key.pem" ]]; then
  if openssl x509 -checkend $((30 * 86400)) -noout -in "$CERTS_DIR/cert.pem" 2>/dev/null; then
    echo "Certificates already exist and are valid for at least 30 more days."
    echo "  cert: $CERTS_DIR/cert.pem"
    echo "  key:  $CERTS_DIR/key.pem"
    echo "Delete them and re-run this script to regenerate."
    exit 0
  else
    echo "Existing certificate is expiring soon — regenerating..."
  fi
fi

echo "Generating self-signed certificate for CN=${CN} ..."

openssl req -x509 \
  -newkey rsa:2048 \
  -keyout "$CERTS_DIR/key.pem" \
  -out "$CERTS_DIR/cert.pem" \
  -days 365 \
  -nodes \
  -subj "/CN=${CN}" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:${CN}" \
  2>/dev/null

echo ""
echo "Done. Files written to:"
echo "  cert: $CERTS_DIR/cert.pem"
echo "  key:  $CERTS_DIR/key.pem"
echo ""
echo "These are self-signed certificates. Browsers will show a security warning."
echo "For production, replace them with a certificate from Let's Encrypt or another CA."
