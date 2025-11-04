import json
import re
import requests

def save_geojson_to_file(geojson_data: dict, filename: str):
  with open(filename, 'w') as file:
    json.dump(geojson_data, file, indent=2)
    

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

if __name__ == "__main__":
  OUTPUT_PATH = 'buildings.json'
  buildings_dict = fetch_building_geojson('https://maps.unl.edu')
  if buildings_dict:
    save_geojson_to_file(buildings_dict, OUTPUT_PATH)
    print(f"Building geojson data saved to {OUTPUT_PATH}.")
  