from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd

from fetch_active_departments import get_jobs_completed_in_time_range, get_departments_from_slurm_users
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
OUTPUT_DIR = PROJECT_ROOT / 'data' / 'output'


def get_and_revise_departments(start_time: datetime, end_time: datetime) -> pd.DataFrame: # based on provided csv
  try:
    jobs_completed = get_jobs_completed_in_time_range(start_time, end_time)
    users = jobs_completed['User']
    departments = get_departments_from_slurm_users(users)
    normalized_departments = apply_department_normalization(departments)
  except Exception as e:
    print(f"Could not fetch jobs from sacct. Probably because this script is being run on a non-HCC system.")
    print("Pulling active departments from existing json file instead.")
    normalized_departments = pd.read_json(DATA_DIR / 'output' / 'departments_completing_jobs_in_past_fortnight.json')

  return normalized_departments


def get_buildings_using_hcc(start_time: datetime, end_time: datetime): # -> pd.DataFrame:
  departments_using_hcc = get_and_revise_departments(start_time, end_time)
  building_names_per_department = [get_buildings_from_department(department) for department in departments_using_hcc['Department_Canonical']]
  buildings_using_hcc = {building for buildings in building_names_per_department for building in buildings} # flattens the list of sets
  return buildings_using_hcc, len(departments_using_hcc)


def get_buildings_from_department(department) -> list:
  relations = pd.read_json(DATA_DIR / 'maps' / 'building_department_mapping.json')['relations']
  return [r["building"] for r in relations if r["department"] == department]
  

# if __name__ == "__main__":
#   building_department_mapping = create_building_department_mapping()
#   output_path = OUTPUT_DIR / 'building_department_mapping.json'
#   save_dict_as_json(building_department_mapping, output_path)
#   print(f"building-department map saved to {output_path}.")

