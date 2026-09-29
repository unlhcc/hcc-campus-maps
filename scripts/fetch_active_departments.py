import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

from normalize_department_names import apply_department_normalization

######################################################################################################
# Purpose: Generates a list of departments whose members have run jobs on HCC in a recent timeframe
# Author:  Luke Doughty (ldoughty2@unl.edu)
# Notes:
#          Usage comes from HCC's Open XDMoD (Jobs realm, grouped by Department), using its public
#          view, so no login is needed. XDMoD only returns per-department totals, never usernames.
#          hcc-xdmod.unl.edu is only reachable on the campus network or through the VPN.
######################################################################################################

XDMOD_URL = os.getenv("XDMOD_URL", "https://hcc-xdmod.unl.edu")

# XDMoD department values that aren't real departments
PLACEHOLDER_DEPARTMENTS = {"unknown", "default", "grid"}


def get_departments_from_xdmod(start_date, end_date) -> pd.DataFrame:
  """Return one row per department with jobs that ended between start_date and end_date."""
  response = requests.post(
    f"{XDMOD_URL}/controllers/user_interface.php",
    data={
      "operation": "get_data",
      "public_user": "true",
      "realm": "Jobs",
      "group_by": "fieldofscience",  # labeled "Department" in HCC's XDMoD
      "statistic": "job_count",
      "start_date": start_date.isoformat(),
      "end_date": end_date.isoformat(),
      "dataset_type": "aggregate",
      "format": "jsonstore",
      "limit": 10000,
      "offset": 0,
    },
    timeout=300,
  )
  response.raise_for_status()
  result = response.json()
  if not result.get("success"):
    sys.exit(f"ERROR: XDMoD query failed: {result.get('message')}")

  rows = []
  for record in result["records"]:
    # Values look like "[UNL] Agronomy and Horticulture"; the bracketed prefix is the campus
    match = re.match(r"\s*\[(.*?)\]\s*(.*)", record["fieldofscience"])
    department = (match.group(2) if match else record["fieldofscience"]).strip()
    if department and department.lower() not in PLACEHOLDER_DEPARTMENTS and float(record["job_count"]) > 0:
      rows.append(department)

  # The same department name can appear under several campuses or XDMoD ids
  return pd.DataFrame({"Department": rows}).drop_duplicates().reset_index(drop=True)


PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'static_map_webpage' / 'departments_completing_jobs.json'


def parse_args():
  parser = argparse.ArgumentParser(description="Write the list of departments that ran jobs on HCC recently, from XDMoD.")
  parser.add_argument('output', nargs='?', type=Path, default=DEFAULT_OUTPUT_PATH,
                      help=f"output JSON path (default: {DEFAULT_OUTPUT_PATH})")
  parser.add_argument('--days', type=int, default=365, help="lookback window in days (default: 365)")
  return parser.parse_args()


if __name__ == "__main__":
  args = parse_args()
  end_date = date.today()
  start_date = end_date - timedelta(days=args.days)

  print(f"Departments running jobs from {start_date} to {end_date} (from {XDMOD_URL}):")
  depts = get_departments_from_xdmod(start_date, end_date)
  if depts.empty:
    # Refuse to publish an empty map; most likely XDMoD is misbehaving
    sys.exit("ERROR: XDMoD returned no departments with jobs; not writing output.")

  normalized_depts = apply_department_normalization(depts)
  print(normalized_depts)
  print('\n')
  records = (normalized_depts[['Department', 'Department_Canonical']]
             .sort_values(by=['Department_Canonical', 'Department'])
             .reset_index(drop=True)
             .to_dict(orient='records'))
  active_departments_dict = {
    "last_updated": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    "departments_completing_jobs": records
  }
  args.output.parent.mkdir(parents=True, exist_ok=True)
  with open(args.output, 'w') as json_file:
    json.dump(active_departments_dict, json_file, indent=2)
  print(f"{len(records)} departments running jobs saved to {args.output}.")
