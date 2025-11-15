import json
import requests
import re
from pathlib import Path

######################################################################################################
# Purpose: Scrapes the geojson list of buildings at UNL from maps.unl.edu
# Author: Luke Doughty (ldoughty2@unl.edu)
# Notes:
# Uses regex to scrape the json from the html, so any updates to maps.unl.edu could break this script.
######################################################################################################

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / 'data'
SCRAPE_SOURCE_URL = 'https://maps.unl.edu'

def save_dict_as_json(data_dict: dict, filename: str):
  with open(filename, 'w') as json_file:
    json.dump(data_dict, json_file, indent=2)
    

def fetch_building_geojson(url: str) -> dict:
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
  
def get_building_properties_dict():
  feature_collection = fetch_building_geojson(SCRAPE_SOURCE_URL)
  print(type(feature_collection))
  return [feature['properties'] for feature in feature_collection['features']]
  

def get_building_names():
  buildings_properties_dict= get_building_properties_dict()
  building_names_list = [building['NAME'] for building in buildings_properties_dict]
  return building_names_list

def get_building_ids():
  buildings_properties_dict= get_building_properties_dict()
  building_ids_list = [building['id'] for building in buildings_properties_dict]
  # for b in buildings_properties_dict:
  #   if b["id"] != b["ABBREV"]:
  #       print(f"id doesn't match ABBREV: {b['id']} vs {b['ABBREV']}")
  return building_ids_list

  

if __name__ == "__main__":
  output_path = OUTPUT_DIR / 'buildings.geojson'
  buildings_dict = fetch_building_geojson(SCRAPE_SOURCE_URL)
  if buildings_dict:
    save_dict_as_json(buildings_dict, output_path)
    print(f"Building geojson data saved to {output_path}.")
  
