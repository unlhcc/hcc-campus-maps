import json
import sys
from pathlib import Path

from fetch_buildings import fetch_building_geojson
from create_building_department_mapping import get_buildings_from_department, get_and_revise_departments

PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / 'data'
DEFAULT_OUTPUT_PATH = DEFAULT_OUTPUT_DIR / 'buildings_using_hcc.geojson'

def save_dict_as_json(data_dict: dict, filename: str):
  with open(filename, 'w') as json_file:
    json.dump(data_dict, json_file, indent=2)
    
    
def generate_hcc_usage_geojson() -> dict:
  SCRAPE_SOURCE_URL = 'https://maps.unl.edu'
  departments_using_hcc = get_and_revise_departments()
  building_names_per_department = [get_buildings_from_department(department) for department in departments_using_hcc]
  buildings_using_hcc = {building for buildings in building_names_per_department for building in buildings} # flattens the list of sets
  buildings_geojson = fetch_building_geojson(SCRAPE_SOURCE_URL)
  
  print("\nBuildings Using HCC:")
  print("--------------------")
  print(buildings_using_hcc)
  
  print("\nbuilding NAMEs: ")
  print("--------------------")
  for feature in buildings_geojson["features"]:
    feature["properties"]["uses_hcc"] = (feature["properties"]["NAME"] in buildings_using_hcc)
    print(feature["properties"]["NAME"])
    
  return buildings_geojson
    
if __name__ == "__main__":
  output_path = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_OUTPUT_PATH
  hcc_usage_geojson = generate_hcc_usage_geojson()
  if hcc_usage_geojson:
    save_dict_as_json(hcc_usage_geojson, output_path)
    print(f"HCC usage geojson data saved to {output_path}.")
  else:
    print("something went wrong")