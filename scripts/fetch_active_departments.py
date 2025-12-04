import os
from dotenv import load_dotenv

import subprocess
from io import StringIO
import pandas as pd
import sacct
import mysql.connector
from datetime import datetime, timedelta

######################################################################################################
# Purpose: Generates a set of departments whose members have created Slurm jobs in a recent timeframe
# Author:  Luke Doughty (ldoughty2@unl.edu)
# Notes:
#          RCF stands for "Research Computing Facility".
#          Currently, this script only works when run from Swan.
#          Sacct.execute() didn't work for me ):
######################################################################################################

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
    
def get_current_top_users_swan() -> pd.DataFrame:
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
  jobs_completed_today = get_jobs_completed_in_time_range(TODAY, END_OF_DAY)
  print(jobs_completed_today.head(10))
  print('\n')
  
  print("Departments Completing Jobs Today:")
  users = jobs_completed_today['User']
  departments = get_departments_from_slurm_users(users)
  print(departments)
  print('\n')

  print("Departments Completing Jobs in the past hour:")
  jobs_completed_in_past_hour = get_jobs_completed_in_time_range(datetime.now() - timedelta(hours=1), datetime.now())
  users = jobs_completed_in_past_hour['User']
  depts = get_departments_from_slurm_users(users)
  print(depts)
  
  print("Departments Completing Jobs in the past fortnight:")
  jobs_completed_in_past_fortnite = get_jobs_completed_in_time_range(datetime.now() - timedelta(days=14), datetime.now())
  users = jobs_completed_in_past_fortnite['User']
  depts = get_departments_from_slurm_users(users)
  print(depts)
  
