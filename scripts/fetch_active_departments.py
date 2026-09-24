import argparse
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

import subprocess
from io import StringIO
import pandas as pd
import sacct
import mysql.connector
from datetime import datetime, timedelta, timezone

from normalize_department_names import apply_department_normalization

######################################################################################################
# Purpose: Generates a list of departments whose members have created Slurm jobs in a recent timeframe
# Author:  Luke Doughty (ldoughty2@unl.edu)
# Notes:
#          RCF stands for "Research Computing Facility".
#          Currently, this script only works when run from on the HCC network.
#          Sacct.execute() didn't work for me ):
######################################################################################################

# Get further back usage history from XDmod. Shoot for the web interface because API is very slow. Figure out which call we need to work and work with Caughlin to get it working. 

load_dotenv()
mysql_host = os.getenv("RCF_MYSQL_HOST")
mysql_user = os.getenv("RCF_MYSQL_USER")
mysql_password = os.getenv("RCF_MYSQL_PASSWORD")
mysql_database = os.getenv("RCF_MYSQL_DATABASE_NAME")

def execute_sacct(sacct_obj) -> pd.DataFrame:
  result = subprocess.run(sacct_obj.cmd, capture_output=True, text=True, check=True)
  column_names = sacct_obj.options['format']
  df = pd.read_csv(StringIO(result.stdout), delimiter='|', names=column_names)
  return df


def get_departments_from_slurm_users(users_list) -> pd.DataFrame:
  mydb = mysql.connector.connect(
    host=mysql_host,
    user=mysql_user,
    password=mysql_password,
    database=mysql_database
  )
  
  try:
    cursor = mydb.cursor()
    parameterized_users_list = ', '.join(['%s'] * len(users_list))
    query = f"SELECT Department FROM Personal WHERE LoginID IN ({parameterized_users_list})"
    cursor.execute(query, tuple(users_list))
    results = cursor.fetchall()
    
    df = pd.DataFrame(results, columns=['Department'])
    df = df[df['Department'].notna() & (df['Department'].str.strip() != '')]
    df = df[['Department']].drop_duplicates().reset_index(drop=True)

    return df
  finally:
    cursor.close()
    mydb.close()

def get_jobs_completed_in_time_range(start_time, end_time) -> pd.DataFrame:
  command = sacct.Sacct(
    allusers=True,
    starttime=start_time.strftime('%Y-%m-%dT%H:%M:%S'),
    endtime=end_time.strftime('%Y-%m-%dT%H:%M:%S'),
    format=['JobID', 'JobName', 'User', 'Elapsed', 'End', 'State'],
    state=['COMPLETED'],
    noheader=True,
    parsable2=True,
    allocations=True
  )
  df = execute_sacct(command)
  return df
  

PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'static_map_webpage' / 'departments_completing_jobs.json'


def parse_args():
  parser = argparse.ArgumentParser(description="Write the list of departments that completed Slurm jobs recently.")
  parser.add_argument('output', nargs='?', type=Path, default=DEFAULT_OUTPUT_PATH,
                      help=f"output JSON path (default: {DEFAULT_OUTPUT_PATH})")
  parser.add_argument('--days', type=int, default=14, help="lookback window in days (default: 14)")
  return parser.parse_args()


if __name__ == "__main__":
  args = parse_args()
  end_time = datetime.now()
  start_time = end_time - timedelta(days=args.days)

  print(f"Departments completing jobs in the past {args.days} days:")
  jobs = get_jobs_completed_in_time_range(start_time, end_time)
  users = jobs['User'].dropna().unique().tolist()
  if not users:
    # Refuse to publish an empty map; most likely sacct is misbehaving
    sys.exit("ERROR: sacct returned no users with completed jobs; not writing output.")

  depts = get_departments_from_slurm_users(users)
  if depts.empty:
    sys.exit("ERROR: no departments found for Slurm users; not writing output.")

  normalized_depts = apply_department_normalization(depts)
  print(normalized_depts)
  print('\n')
  # Only aggregate department names are written; usernames never leave this script
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
  print(f"{len(records)} departments completing jobs saved to {args.output}.")
