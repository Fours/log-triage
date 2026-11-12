#!/usr/bin/env bash
#
# Build the site and deploy it to S3 + invalidate CloudFront.
#
# Hosting model (Option B): private S3 bucket behind CloudFront (OAC).
# The site is served at a subdomain root; CloudFront's Origin Path points at
# the "log-triage" prefix, so Vite's base stays "/" and no path rewriting is
# needed in the app.
#
# Config can be overridden with environment variables, or by creating a
# gitignored scripts/deploy.config.local (see DEPLOY.md). At minimum you must
# provide CLOUDFRONT_DISTRIBUTION_ID.

set -euo pipefail

# ---- Config (env overrides win) --------------------------------------------
BUCKET="${DEPLOY_BUCKET:-kylewillett.com}"
PREFIX="${DEPLOY_PREFIX:-log-triage}"
REGION="${DEPLOY_REGION:-us-east-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load gitignored local overrides (e.g. CLOUDFRONT_DISTRIBUTION_ID) if present.
if [ -f "$SCRIPT_DIR/deploy.config.local" ]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/deploy.config.local"
fi

# ---- Preconditions ---------------------------------------------------------
command -v aws >/dev/null 2>&1 || {
  echo "error: aws CLI not found. Install and configure it (aws configure)." >&2
  exit 1
}

: "${CLOUDFRONT_DISTRIBUTION_ID:?Set CLOUDFRONT_DISTRIBUTION_ID (env var or scripts/deploy.config.local)}"

DEST="s3://${BUCKET}/${PREFIX}"

cd "$ROOT_DIR"

# ---- Build -----------------------------------------------------------------
# The page's numbers come from site/src/data/generated/, written by
# `npm run export:site` at the repo root and committed. Re-run that after new
# eval runs; the deploy builds whatever is committed.
echo "==> Building (npm run build)..."
npm run build

# ---- Upload ----------------------------------------------------------------
# 1) Everything except index.html: content-hashed filenames, cache forever.
#    --delete removes stale objects (old bundles) under the prefix.
echo "==> Syncing assets to ${DEST}/ (immutable, 1y cache)..."
aws s3 sync dist/ "${DEST}/" \
  --region "$REGION" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

# 2) index.html: no caching, so a new deploy is picked up immediately.
echo "==> Uploading index.html (no-cache)..."
aws s3 cp dist/index.html "${DEST}/index.html" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "text/html"

# ---- Invalidate CloudFront -------------------------------------------------
# Viewers hit the subdomain root, so the viewer-facing paths are "/*".
echo "==> Invalidating CloudFront (${CLOUDFRONT_DISTRIBUTION_ID})..."
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.{Id:Id,Status:Status}' \
  --output table

echo "==> Done. New version will be live once the invalidation completes (usually <1 min)."
