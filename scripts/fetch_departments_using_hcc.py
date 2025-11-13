import os
import pandas as pd
import sacct
from datetime import datetime, timedelta

# RCF stands for "Research Computing Facility".
# Currently, this script only works when run from Swan.
db_host = os.getenv("RCF_MYSQL_DB_HOST")
db_user = os.getenv("RCF_MYSQL_DB_USER")
db_password = os.getenv("RCF_MYSQL_DB_PASSWORD")

def get_jobs_completed_today():
  today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
  s = sacct.Sacct(
    allusers=True,
    starttime=today.strftime('%Y-%m-%dT%H:%M:%S'),
    format=['JobID', 'JobName', 'User', 'End', 'State'],
    state=['COMPLETED', 'FAILED', 'PREEMPTIVE'],
  ).execute()
  df = s.df
  return df
    
def get_current_top_users_swan():
  s = sacct.Sacct(
    allusers=True,
    format=['User', 'AllocCPUS'],
    state=['RUNNING', 'PENDING']
  ).execute()
  df = s.df
  
  if not df.empty:
    user_stats = df.groupbyy('User').agg({
      'AllocCPUS': 'sum',
      'JobID': 'count'
    }).rename(columns={'JobID': 'JobCount'})
    
    user_stats = user_stats.sort_values('AllocCPUS', ascending=False)
    return user_stats
  
  return df




if __name__ == "__main__":
  top_users = get_current_top_users_swan()
  print(top_users.head(5))
  