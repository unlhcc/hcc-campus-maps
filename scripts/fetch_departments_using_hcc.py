import os
from dotenv import load_dotenv

import subprocess
from io import StringIO
import pandas as pd
import sacct
import mysql.connector
from datetime import datetime, timedelta

# RCF stands for "Research Computing Facility".
# Currently, this script only works when run from Swan.
# Sacct.execute() didn't work for me ):
load_dotenv()
mysql_host = os.getenv("RCF_MYSQL_HOST")
mysql_user = os.getenv("RCF_MYSQL_USER")
mysql_password = os.getenv("RCF_MYSQL_PASSWORD")
mysql_database = os.getenv("RCF_MYSQL_DATABASE_NAME")

def execute_sacct(sacct_obj):
  result = subprocess.run(sacct_obj.cmd, capture_output=True, text=True, check=True)
  column_names = sacct_obj.options['format']
  df = pd.read_csv(StringIO(result.stdout), delimiter='|', names=column_names)
  return df

def get_departments_from_slurm_users(users_list):
  mydb = mysql.connector.connect(
    host=mysql_host,
    user=mysql_user,
    password=mysql_password,
    database=mysql_database
  )
  
  try:
    cursor = mydb.cursor()
    parameterized_users_list = ', '.join(['%s'] * len(users_list))
    query = f"SELECT LoginID, Department FROM Personal WHERE LoginID IN ({parameterized_users_list})"
    cursor.execute(query, tuple(users_list))
    results = cursor.fetchall()
    departments = set(row[1] for row in results if row[1] is not None) # grabs Department
    return departments
  finally:
    cursor.close()
    mydb.close()

def get_jobs_completed_in_time_range(start_time, end_time):
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
  jobs_completed_today = get_jobs_completed_in_time_range(TODAY, END_OF_DAY)
  print(jobs_completed_today.head(10))
  print('\n')
  
  print("Departments Completing Jobs Today:")
  users = jobs_completed_today['User']
  departments = get_departments_from_slurm_users(users)
  print(departments.head(10))
  print('\n')
  
