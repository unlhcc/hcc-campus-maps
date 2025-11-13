import os
import subprocess
from io import StringIO

import pandas as pd
import sacct
from datetime import datetime, timedelta

# RCF stands for "Research Computing Facility".
# Currently, this script only works when run from Swan.
# Sacct.execute() didn't work for me ):
# db_host = os.getenv("RCF_MYSQL_DB_HOST")
# db_user = os.getenv("RCF_MYSQL_DB_USER")
# db_password = os.getenv("RCF_MYSQL_DB_PASSWORD")

def execute_sacct(sacct_obj):
  result = subprocess.run(sacct_obj.cmd, capture_output=True, text=True, check=True)
  column_names = sacct_obj.options['format']
  df = pd.read_csv(StringIO(result.stdout), delimiter='|', names=column_names)
  return df

def get_jobs_completed_today():
  today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
  command = sacct.Sacct(
    allusers=True,
    starttime=today.strftime('%Y-%m-%dT%H:%M:%S'),
    format=['JobID', 'JobName', 'User', 'End', 'State'],
    state=['COMPLETED', 'FAILED'],
    noheader=True,
    parsable2=True,
    allocations=True
    
  )
  df = execute_sacct(command)
  return df
    
def get_current_top_users_swan():
  command = sacct.Sacct(
    allusers=True,
    format=['User', 'AllocCPUS'],
    state=['RUNNING', 'PENDING'],
    noheader=True,
    parsable2=True,
    allocations=True

  )
  df = execute_sacct(command)

  
  if not df.empty:
    user_stats = df.groupby('User').agg({
      'AllocCPUS': 'sum',
      'JobID': 'count'
    }).rename(columns={'JobID': 'JobCount'})
    
    user_stats = user_stats.sort_values('AllocCPUS', ascending=False)
    return user_stats
  
  return df




if __name__ == "__main__":
  top_users = get_current_top_users_swan()
  print(top_users.head(5))
  print('\n')
  jobs_completed_today = get_jobs_completed_today()
  print(jobs_completed_today.head(5))
  