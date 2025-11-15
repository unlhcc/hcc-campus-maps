from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd

from fetch_active_departments import get_jobs_completed_in_time_range, get_departments_from_slurm_users
from fetch_buildings import get_building_properties_dict, fetch_building_geojson, save_dict_as_json

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
OUTPUT_DIR = PROJECT_ROOT / 'data'
map_csv_dataframe = pd.read_csv(DATA_DIR / 'map_groups_to_departments.csv', header=0)
map_csv_dataframe.columns = map_csv_dataframe.columns.str.strip()
df = map_csv_dataframe[['Department','Revised_Department','Building']]

def create_department_normalizer_map():
  dept_map_df = df[['Department','Revised_Department']].copy()
  # Drop rows where Revised_Department is missing
  dept_map_df = dept_map_df[
    dept_map_df["Revised_Department"].notna() &
    (dept_map_df["Revised_Department"].str.strip() != "")
  ]
    
  # Normalize noisy department strings
  dept_map_df["Department_norm"] = (
    dept_map_df["Department"]
      .str.strip()
      .str.lower()
      .str.replace("&", "and")
  )
  
  dept_mapping = (
    dept_map_df.set_index("Department_norm")["Revised_Department"]
      .to_dict()
  )
  return dept_mapping

  

def get_and_revise_departments(): # based on provided csv
  jobs_completed_in_past_hour = get_jobs_completed_in_time_range(datetime.now() - timedelta(hours=1), datetime.now())
  users = jobs_completed_in_past_hour['User']
  departments = get_departments_from_slurm_users(users)
  normalizer_map = create_department_normalizer_map()
  normalized_departments = [normalizer_map[department] for department in departments]
  return set(normalized_departments)

def get_relations(): # based on provided csv
  relations = [
    {
    "building": row["Building"],
    "department": row["Revised_Department"]
    }
    for _, row in df.iterrows()    
  ]
  return relations

  
  

if __name__ == "__main__":
  building_properties_dict = get_building_properties_dict()
  buildings = [building["NAME"] for building in building_properties_dict]
  departments = get_and_revise_departments()
  relations = get_relations()
  
  building_department_mapping = {
    "buildings": buildings,
    "departments": departments,
    "relations": get_relations
  }
  
  print(building_department_mapping)
  output_path = OUTPUT_DIR / 'buildings.geojson'
  save_dict_as_json(building_department_mapping, output_path)

