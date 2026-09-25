#!/usr/bin/env bash
# Upload the site to S3 and invalidate the CloudFront cache.
# Usage: BUCKET=nicklackman.com DISTRIBUTION_ID=E37HOY2EC40ION ./infra/deploy.sh
#
# public/for/ (company-specific pages) is gitignored. It is never deleted from S3
# by this script, so deploying from a checkout that lacks it is safe. When the
# folder exists locally, it is uploaded.
set -euo pipefail

: "${BUCKET:?Set BUCKET to the S3 bucket name}"
: "${DISTRIBUTION_ID:?Set DISTRIBUTION_ID to the CloudFront distribution ID}"

cd "$(dirname "$0")/.."

# HTML: short cache so edits show up quickly.
aws s3 sync public/ "s3://${BUCKET}/" --delete \
  --exclude "*" --include "*.html" --exclude "for/*" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public, max-age=300"

# Everything else.
aws s3 sync public/ "s3://${BUCKET}/" --delete \
  --exclude "*.html" --exclude "for/*" \
  --cache-control "public, max-age=86400"

# Company-specific pages: upload if present, never delete.
if [ -d public/for ]; then
  aws s3 sync public/for/ "s3://${BUCKET}/for/" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "public, max-age=300"
else
  echo "Note: public/for/ not found locally; existing pages under /for/ left untouched."
fi

aws cloudfront create-invalidation --distribution-id "${DISTRIBUTION_ID}" --paths "/*" >/dev/null
echo "Deployed to s3://${BUCKET} and invalidated ${DISTRIBUTION_ID}."
