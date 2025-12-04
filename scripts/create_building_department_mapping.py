from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd

from fetch_active_departments import get_jobs_completed_in_time_range, get_departments_from_slurm_users
from fetch_buildings import get_building_properties_dict, save_dict_as_json
from normalize_department_names import apply_department_normalization

######################################################################################################
# Purpose: Creates a join table between buildings and departments which can be used to indicate which 
#          buildings have made use of the HCC recently
# Author:  Luke Doughty (ldoughty2@unl.edu)
# Notes:   Building to department relations come from an old CSV. Hopefully there is a better, 
#          automated solution.
######################################################################################################

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
OUTPUT_DIR = PROJECT_ROOT / 'data'
map_csv_dataframe = pd.read_csv(DATA_DIR / 'map_groups_to_departments.csv', header=0)
map_csv_dataframe.columns = map_csv_dataframe.columns.str.strip()
df = map_csv_dataframe[['Department','Revised_Department','Building']]


def get_and_revise_departments() -> pd.DataFrame: # based on provided csv
  jobs_completed_in_past_hour = get_jobs_completed_in_time_range(datetime.now() - timedelta(days=14), datetime.now())
  users = jobs_completed_in_past_hour['User']
  departments = get_departments_from_slurm_users(users)
  normalized_departments = apply_department_normalization(departments)
  return normalized_departments


def get_relations(): # based on provided csv
  unique_df = df[["Building", "Revised_Department"]].dropna().drop_duplicates()
  
  relations = [
    {
      "building": row["Building"],
      "department": row["Revised_Department"]
    }
    for _, row in unique_df.iterrows()
  ]
  
  return relations
  

def create_building_department_mapping():
  building_properties_dict = get_building_properties_dict()
  buildings = [building["NAME"] for building in building_properties_dict]
  departments = get_and_revise_departments().toList('Department')
  relations = get_relations()
  
  building_department_mapping = {
    "buildings": buildings,
    "departments": departments,
    "relations": relations
  }
  return building_department_mapping


def get_buildings_from_department(department) -> list:
  relations = get_relations()
  return [r["building"] for r in relations if r["department"] == department]
  

if __name__ == "__main__":
  building_department_mapping = create_building_department_mapping()
  output_path = OUTPUT_DIR / 'building_department_mapping.json'
  save_dict_as_json(building_department_mapping, output_path)
  print(f"building-department map saved to {output_path}.")

