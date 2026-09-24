#!/bin/bash

######################################################################################################
# Purpose: Runs inside HCC (via scrontab or cron). Generates the list of departments completing jobs
#          and pushes it to GitHub, where the Pages workflow rebuilds and publishes the map.
# Notes:
#          Only aggregate department names are pushed; usernames never leave HCC.
#          Configuration is read from an env file (default: ~/.config/hcc-campus-maps/publish.env).
#          See scripts/publish.env.example for the available settings.
######################################################################################################

set -euo pipefail

ENV_FILE="${HCC_MAP_ENV_FILE:-$HOME/.config/hcc-campus-maps/publish.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

# Export everything in the env file so the Python script sees the RCF_MYSQL_* settings
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

: "${DEPLOY_KEY:?DEPLOY_KEY must be set in $ENV_FILE}"
REPO_URL="${REPO_URL:-git@github.com:unlhcc/hcc-campus-maps.git}"
BRANCH="${BRANCH:-main}"
PYTHON="${PYTHON:-python3}"
LOOKBACK_DAYS="${LOOKBACK_DAYS:-14}"
GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-HCC Campus Map Bot}"
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-hcc-campus-map-bot@users.noreply.github.com}"
OUTPUT_REL="static_map_webpage/departments_completing_jobs.json"

export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "==> $(date '+%Y-%m-%dT%H:%M:%S%z') Cloning $REPO_URL ($BRANCH)"
git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$WORK_DIR/repo"
cd "$WORK_DIR/repo"

echo "==> Generating active departments (past $LOOKBACK_DAYS days)"
"$PYTHON" scripts/fetch_active_departments.py "$OUTPUT_REL" --days "$LOOKBACK_DAYS"

if git diff --quiet -- "$OUTPUT_REL"; then
  echo "==> No changes to publish"
  exit 0
fi

cp "$OUTPUT_REL" "$WORK_DIR/departments.json"
COMMIT_MSG="Update active departments ($(date +%Y-%m-%d))"

# Retry in case someone pushed to the branch while we were running. Rebasing a shallow clone
# is unreliable, so reset to the new tip and re-apply the generated file instead.
for attempt in 1 2 3; do
  cp "$WORK_DIR/departments.json" "$OUTPUT_REL"
  git add "$OUTPUT_REL"
  git commit --quiet -m "$COMMIT_MSG"
  if git push --quiet origin "HEAD:$BRANCH"; then
    echo "==> Published $OUTPUT_REL"
    exit 0
  fi
  echo "WARNING: push failed (attempt $attempt), retrying on latest $BRANCH..." >&2
  git fetch --quiet --depth 1 origin "$BRANCH"
  git reset --quiet --hard FETCH_HEAD
done

echo "ERROR: could not push after 3 attempts" >&2
exit 1
