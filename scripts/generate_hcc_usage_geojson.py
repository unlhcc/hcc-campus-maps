from datetime import datetime, timedelta
import json
import sys
from pathlib import Path

from fetch_buildings import fetch_building_geojson
from building_department_mapping import get_and_revise_departments

PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / 'data' / 'output'
DEFAULT_OUTPUT_PATH = DEFAULT_OUTPUT_DIR / 'buildings_using_hcc.geojson'

def save_dict_as_json(data_dict: dict, filename: str):
  with open(filename, 'w') as json_file:
    json.dump(data_dict, json_file, indent=2)
    
    
def generate_hcc_usage_geojson() -> dict:
  # Get building shapes
  SCRAPE_SOURCE_URL = 'https://maps.unl.edu'
  usage_geojson = dict()
  usage_geojson["buildings"] = fetch_building_geojson(SCRAPE_SOURCE_URL)
  
  # Get departments
  departments = get_and_revise_departments(datetime.now() - timedelta(days=30), datetime.now())
  usage_geojson["departments_using_hcc"] = departments.to_dict(orient='records')
  
  # Add departments to building properties
  departments_per_building_path = PROJECT_ROOT / 'data' / 'maps' / 'departments_per_building.json'
  with open(departments_per_building_path, 'r') as f:
    departments_per_building = json.load(f)['building_departments']
    
  for feature in usage_geojson["buildings"]["features"]:
    building_name = feature["properties"]["name"]
    if building_name in departments_per_building:
      feature["properties"]["departments"] = departments_per_building[building_name]
    else:
      feature["properties"]["departments"] = []

  return usage_geojson
    
    
if __name__ == "__main__":
  output_path = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_OUTPUT_PATH
  hcc_usage_geojson = generate_hcc_usage_geojson()
  if hcc_usage_geojson:
    save_dict_as_json(hcc_usage_geojson, output_path)
    print(f"HCC usage geojson data saved to {output_path}.")
  else:
    print("something went wrong")
