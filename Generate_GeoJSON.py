import pandas as pd
import json 

# Read input file that maps departments to buildings
updated_departments_df = pd.read_csv('input-files/map_groups_to_departments.csv', header=0)

# Read original geojson of campus map
original_map_data_df = pd.read_json('input-files/map_data.json')
normalized_original_data_df = pd.json_normalize(original_map_data_df['features'])

# Add new fields to the geojson
normalized_original_data_df['properties.departments'] = [[] for _ in range(len(normalized_original_data_df))]
normalized_original_data_df['properties.fill'] = ["#808080" for _ in range(len(normalized_original_data_df))]
normalized_original_data_df['properties.stroke-width'] = [0.5 for _ in range(len(normalized_original_data_df))]

# For each department, iterate through the geojson to see if there is a match for that 
# department's building. If there is a match, add the department to the "properties.departments" field
# in the geojson and set the color of the building to red.
for i in range(0, len(updated_departments_df)):
    for j in range(0, len(normalized_original_data_df)):
        if updated_departments_df.iloc[i, 3] == normalized_original_data_df.iloc[j, 5]:
            if updated_departments_df.iloc[i, 1] not in normalized_original_data_df.iloc[j, 10]:
                normalized_original_data_df.iloc[j, 10].append(updated_departments_df.iloc[i, 1])
            if len(normalized_original_data_df.iloc[j, 10]) > 0:
                normalized_original_data_df.iloc[j, 11] = "#FF0000"

# Nest fields under "properties" field
normalized_original_data_df["properties"] = normalized_original_data_df.apply(lambda row: {"bldg_no": row["properties.bldg_no"],
                                                                                            "ABBREV": row["properties.ABBREV"],
                                                                                            "NAME": row["properties.NAME"],
                                                                                            "Address": row["properties.Address"],
                                                                                            "CAMPUS": row["properties.CAMPUS"],
                                                                                            "location": row["properties.location"],
                                                                                            "id": row["properties.id"],
                                                                                            "departments": row["properties.departments"],
                                                                                            "fill": row["properties.fill"],
                                                                                            "stroke-width": row["properties.stroke-width"]
                                                                                            }, axis=1)

# Drop original fields after nesting
normalized_original_data_df = normalized_original_data_df.drop(columns=["properties.bldg_no", "properties.ABBREV", "properties.NAME",
                                                                        "properties.Address", "properties.CAMPUS", "properties.location",
                                                                        "properties.id", "properties.departments", "properties.fill", "properties.stroke-width"])

# Nest fields under "geometry" field
normalized_original_data_df["geometry"] = normalized_original_data_df.apply(lambda row: {"type": row["geometry.type"], "coordinates": row["geometry.coordinates"]}, axis=1)

# Drop original fields after nesting
normalized_original_data_df = normalized_original_data_df.drop(columns=["geometry.type", "geometry.coordinates"])

# Reset header fields since they were removed during data normalization
compressed_data = {
    "type": "FeatureCollection",
    "features": normalized_original_data_df.to_dict(orient="records")
}

# Write updated geojson data to output file
with open("output-files/geojson.json", "w") as file:
    json.dump(compressed_data, file, indent=4)