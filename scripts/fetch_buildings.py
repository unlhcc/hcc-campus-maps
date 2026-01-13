import json
import requests
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

from building_department_mapping import get_and_revise_departments

######################################################################################################
# Purpose: Scrapes the geojson list of buildings at UNL from maps.unl.edu. Attaches department info to each building.
# Author:  Luke Doughty (ldoughty2@unl.edu)
# Notes:
#          Uses regex to scrape the json from the html, so any updates to maps.unl.edu could break this script.
######################################################################################################


PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / 'data' / 'output'
DEFAULT_OUTPUT_PATH = DEFAULT_OUTPUT_DIR / 'buildings.geojson'

SCRAPE_SOURCE_URL = 'https://maps.unl.edu'
DEPARTMENTS_PER_BUILDING_PATH = PROJECT_ROOT / 'data' / 'maps' / 'departments_per_building.json'

def save_dict_as_json(data_dict: dict, filename: str):
  with open(filename, 'w') as json_file:
    json.dump(data_dict, json_file, indent=2)
    

def fetch_raw_building_geojson(url: str) -> dict:
  try:
    print(f"Fetching building geojson data from {url}...")
    response = requests.get(url)
    html = response.text
    
    match = re.search(r'UNLTourMap\.setMarkerData\((.*?)\);', html, re.DOTALL)
    
    if not match:
      raise ValueError("Could not find the geojson data in the HTML content.")
    
    data = json.loads(match.group(1))
    buildings = data['buildings']
    return buildings

  except Exception as e:
    print(f"An error occurred while fetching or parsing the data: {e}")
    return {}
  
  
def normalize_property_names(raw_buildings_geojson: dict) -> dict:
  building_dict = dict()
  building_dict["type"] = "FeatureCollection"
  building_dict["features"] = []
  for building in raw_buildings_geojson["features"]:
    feature = {
      "type": "Feature",
      "geometry": building["geometry"],
      "properties": dict()
    }
    feature["properties"]["abbrev"] = building["properties"].get("ABBREV", "")
    feature["properties"]["name"] = building["properties"].get("NAME", "")
    # "bldg_no", "ABBREV", "NAME", "Address", "CAMPUS", "location", "id" are all available
    building_dict["features"].append(feature)
    return building_dict
  
  
def attach_departments_property(buildings_geojson: dict) -> dict:
  # Get departments using HCC
  departments = get_and_revise_departments(datetime.now() - timedelta(days=30), datetime.now())
  departments = departments["Department_Canonical"].drop_duplicates()
  buildings_geojson["departments_using_hcc"] = departments.to_list()
  
  # Add departments to building properties (this is independent of if they use HCC)
  with open(DEPARTMENTS_PER_BUILDING_PATH, 'r') as f:
    departments_per_building = json.load(f)['building_departments']
    
  for building in buildings_geojson["buildings"]["features"]:
    print(f"\nprocessing building: {building}")
    building_name = building["properties"]["name"]
    print(f"building_name: {building_name} has departments: {departments_per_building.get(building_name, [])}")
    building["properties"]["departments"] = departments_per_building.get(building_name, [])
    
  return buildings_geojson
  

def fetch_building_geojson(url: str) -> dict:
  raw_buildings_dict = fetch_raw_building_geojson(url)
  buildings_dict = normalize_property_names(raw_buildings_dict)
  buildings_dict = attach_departments_property(buildings_dict)
  return buildings_dict


def get_building_properties_dict():
  feature_collection = fetch_building_geojson(SCRAPE_SOURCE_URL)
  print(type(feature_collection))
  return [feature['properties'] for feature in feature_collection['features']]
  

def get_building_names():
  buildings_properties_dict= get_building_properties_dict()
  building_names_list = [building['NAME'] for building in buildings_properties_dict]
  return building_names_list


if __name__ == "__main__":
  # Allows output path to be specified as an command line argument
  output_path = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_OUTPUT_PATH
  buildings_dict = fetch_building_geojson(SCRAPE_SOURCE_URL)
  if buildings_dict:
    save_dict_as_json(buildings_dict, output_path)
    print(f"Building geojson saved to {output_path}.")
  else:
    print("something went wrong")
  
