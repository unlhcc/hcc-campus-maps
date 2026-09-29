#!/bin/bash
#SBATCH --job-name=hcc-campus-map
#SBATCH --time=00:15:00
#SBATCH --mem=2G

######################################################################################################
# Purpose: Runs scripts/publish_departments.sh daily on clusters where scrontab and cron are disabled.
#          Each run first queues the next day's run with `sbatch --begin`, then publishes.
# Usage:
#          mkdir -p $WORK/logs
#          sbatch --output=$WORK/logs/hcc-campus-map-%j.out scripts/publish_departments.sbatch
#          (runs now, then daily at RUN_AT; stop the chain with `scancel -n hcc-campus-map`)
# Notes:
#          Compute nodes need outbound access to github.com and to the RCF MySQL server.
#          Settings come from the same env file as publish_departments.sh.
######################################################################################################

set -euo pipefail

ENV_FILE="${HCC_MAP_ENV_FILE:-$HOME/.config/hcc-campus-maps/publish.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

RUN_AT="${RUN_AT:-05:30}"
LOG_DIR="${LOG_DIR:-${WORK:-$HOME}/logs}"
JOB_NAME="${SLURM_JOB_NAME:-hcc-campus-map}"

# Inside a batch job $0 is Slurm's spooled copy, so ask Slurm for the original script path
SCRIPT_PATH="$(scontrol show job "${SLURM_JOB_ID:?must run under sbatch}" | sed -n 's/^ *Command=//p')"
SCRIPT_PATH="${SCRIPT_PATH:-$HOME/hcc-campus-maps/scripts/publish_departments.sbatch}"
PUBLISH_SCRIPT="$(dirname "$SCRIPT_PATH")/publish_departments.sh"

# Queue tomorrow's run before doing any work, so a failed publish doesn't break the chain.
# Skip if another run is already pending (e.g. a second manual sbatch), to avoid parallel chains.
if [ -n "$(squeue --me --name="$JOB_NAME" --states=PENDING --noheader --format=%i)" ]; then
  echo "==> A $JOB_NAME job is already pending; not queueing another"
else
  next_run="$(date -d "tomorrow $RUN_AT" +%Y-%m-%dT%H:%M:%S)"
  sbatch --quiet --begin="$next_run" --output="$LOG_DIR/$JOB_NAME-%j.out" "$SCRIPT_PATH"
  echo "==> Queued next run for $next_run"
fi

"$PUBLISH_SCRIPT"
