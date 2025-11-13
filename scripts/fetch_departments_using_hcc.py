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

def get_jobs_in_time_range(start_time, end_time):
  command = sacct.Sacct(
    allusers=True,
    starttime=start_time.strftime('%Y-%m-%dT%H:%M:%S'),
    endtime=end_time.strftime('%Y-%m-%dT%H:%M:%S'),
    format=['JobID', 'JobName', 'User', 'End', 'State'],
    state=['COMPLETED', 'FAILED'],
    noheader=True,
    parsable2=True,
    allocations=True
  )
  df = execute_sacct(command)
  df = df[df['User'].notna() & (df['User'] != '')]
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
  df = df[df['User'].notna() & (df['User'] != '')]
  
  if not df.empty:
    df['AllocCPUS'] = pd.to_numeric(df['AllocCPUS'], errors='coerce').fillna(0)
    user_stats = df.groupby('User').agg({
      'AllocCPUS': 'sum'
    })
    
    user_stats = user_stats.sort_values('AllocCPUS', ascending=False)
    return user_stats
  
  return df




if __name__ == "__main__":
  TODAY = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
  END_OF_DAY = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
  top_users = get_current_top_users_swan()
  print("Top Users:")
  print(top_users.head(5))
  print('\n')
  print("Jobs Completed Today:")
  jobs_completed_today = get_jobs_in_time_range(TODAY, END_OF_DAY)
  print(jobs_completed_today.head(5))
  
