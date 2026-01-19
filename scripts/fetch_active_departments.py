import json
import os
from pathlib import Path
from dotenv import load_dotenv

import subprocess
from io import StringIO
import pandas as pd
import sacct
import mysql.connector
from datetime import datetime, timedelta

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
  

if __name__ == "__main__":
  PROJECT_ROOT = Path(__file__).parent.parent
  DATA_DIR = PROJECT_ROOT / 'data'
  OUTPUT_DIR = PROJECT_ROOT / 'data' / 'output'
  OUTPUT_PATH = OUTPUT_DIR / 'departments_completing_jobs.json'
  TODAY = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
  END_OF_DAY = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)

  print("Departments Completing Jobs in the past fortnight:")
  jobs_completed_in_past_fortnite = get_jobs_completed_in_time_range(datetime.now() - timedelta(days=14), datetime.now())
  users = jobs_completed_in_past_fortnite['User']
  depts = get_departments_from_slurm_users(users)
  normalized_depts = apply_department_normalization(depts)
  print(normalized_depts)
  print('\n')
  active_departments_dict = {
    "last_updated": datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'),
    "departments_completing_jobs": normalized_depts[['Department']].sort_values(by='Department').reset_index(drop=True).to_dict(orient='records')
  }
  with open(OUTPUT_PATH, 'w') as json_file:
    json.dump(active_departments_dict, json_file, indent=2)
  print(f"departments completing jobs in past fortnight saved to {OUTPUT_PATH}.")
  