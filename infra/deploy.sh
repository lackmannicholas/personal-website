#!/usr/bin/env bash
# Build the site with Hugo, upload it to S3, and invalidate the CloudFront cache.
# Usage: BUCKET=nicklackman.com DISTRIBUTION_ID=E37HOY2EC40ION ./infra/deploy.sh
#
# Drafts are never published. static/for/ (company-specific pages) is gitignored;
# pages under /for/ are uploaded when present locally and never deleted from S3,
# so deploying from a fresh checkout or CI is safe.
set -euo pipefail

: "${BUCKET:?Set BUCKET to the S3 bucket name}"
: "${DISTRIBUTION_ID:?Set DISTRIBUTION_ID to the CloudFront distribution ID}"
command -v hugo >/dev/null || { echo "Hugo is not installed (brew install hugo)"; exit 1; }

cd "$(dirname "$0")/.."

rm -rf public
hugo --gc --minify

# HTML and feeds: short cache so edits show up quickly.
aws s3 sync public/ "s3://${BUCKET}/" --delete \
  --exclude "*" --include "*.html" --exclude "for/*" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public, max-age=300"
aws s3 sync public/ "s3://${BUCKET}/" --delete \
  --exclude "*" --include "*.xml" --exclude "for/*" \
  --content-type "application/xml; charset=utf-8" \
  --cache-control "public, max-age=300"

# Everything else (CSS, robots.txt, images).
aws s3 sync public/ "s3://${BUCKET}/" --delete \
  --exclude "*.html" --exclude "*.xml" --exclude "for/*" \
  --cache-control "public, max-age=3600"

# Company-specific pages: upload if present, never delete.
if [ -d public/for ]; then
  aws s3 sync public/for/ "s3://${BUCKET}/for/" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "public, max-age=300"
else
  echo "Note: static/for/ not found locally; existing pages under /for/ left untouched."
fi

aws cloudfront create-invalidation --distribution-id "${DISTRIBUTION_ID}" --paths "/*" >/dev/null
echo "Deployed to s3://${BUCKET} and invalidated ${DISTRIBUTION_ID}."
