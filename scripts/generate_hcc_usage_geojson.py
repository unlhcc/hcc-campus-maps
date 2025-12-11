import datetime
import json
import sys
from pathlib import Path

from fetch_buildings import fetch_building_geojson
from building_department_mapping import get_buildings_using_hcc

PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / 'data' / 'output'
DEFAULT_OUTPUT_PATH = DEFAULT_OUTPUT_DIR / 'buildings_using_hcc.geojson'

def save_dict_as_json(data_dict: dict, filename: str):
  with open(filename, 'w') as json_file:
    json.dump(data_dict, json_file, indent=2)
    
def append_hcc_usage_property(buildings_geojson: dict, buildings_using_hcc: set, usage_designator: str) -> dict:
  for feature in buildings_geojson["features"]:
    building_used_in_this_timeframe = feature["properties"]["NAME"] in buildings_using_hcc
    if building_used_in_this_timeframe:
      feature["properties"]["uses_hcc"] = usage_designator
  return buildings_geojson

    
def generate_hcc_usage_geojson() -> dict:
  SCRAPE_SOURCE_URL = 'https://maps.unl.edu'
  buildings_geojson = fetch_building_geojson(SCRAPE_SOURCE_URL)
  buildings_using_hcc_day, day_count = get_buildings_using_hcc(datetime.now() - datetime.timedelta(days=1), datetime.now())
  buildings_using_hcc_week, week_count = get_buildings_using_hcc(datetime.now() - datetime.timedelta(days=7), datetime.now())
  buildings_using_hcc_month, month_count = get_buildings_using_hcc(datetime.now() - datetime.timedelta(days=30), datetime.now())
  print(f"{day_count} Departments Using HCC in the past day\n")
  print(f"{week_count} Departments Using HCC in the past week\n")
  print(f"{month_count} Departments Using HCC in the past month\n")
  
  usage_geojson = buildings_geojson.copy()
  usage_geojson = append_hcc_usage_property(usage_geojson, buildings_using_hcc_month, "month")
  usage_geojson = append_hcc_usage_property(usage_geojson, buildings_using_hcc_week, "week")
  usage_geojson = append_hcc_usage_property(usage_geojson, buildings_using_hcc_day, "day")

    
  return usage_geojson
    
if __name__ == "__main__":
  output_path = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_OUTPUT_PATH
  hcc_usage_geojson = generate_hcc_usage_geojson()
  if hcc_usage_geojson:
    save_dict_as_json(hcc_usage_geojson, output_path)
    print(f"HCC usage geojson data saved to {output_path}.")
  else:
    print("something went wrong")