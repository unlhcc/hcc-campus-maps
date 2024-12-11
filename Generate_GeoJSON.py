import pandas as pd
import json

pd.set_option('display.max_columns', None)
pd.set_option('display.max_colwidth', None) 

updated_departments_df = pd.read_csv('input-files/map_groups_to_departments.csv', header=0)

original_map_data_df = pd.read_json('input-files/map_data.json')
normalized_original_data_df = pd.json_normalize(original_map_data_df['features'])
print(normalized_original_data_df.columns)

normalized_original_data_df['properties.departments'] = [[] for _ in range(len(normalized_original_data_df))]
normalized_original_data_df['properties.fill'] = ["#808080" for _ in range(len(normalized_original_data_df))]

for i in range(0, len(updated_departments_df)):
    for j in range(0, len(normalized_original_data_df)):
        if updated_departments_df.iloc[i, 5] == normalized_original_data_df.iloc[j, 5]:
            if updated_departments_df.iloc[i, 1] not in normalized_original_data_df.iloc[j, 10]:
                normalized_original_data_df.iloc[j, 10].append(updated_departments_df.iloc[i, 1])
            if len(normalized_original_data_df.iloc[j, 10]) > 0:
                normalized_original_data_df.iloc[j, 11] = "#FF0000"
print(normalized_original_data_df)

normalized_original_data_df["properties"] = normalized_original_data_df.apply(lambda row: {"bldg_no": row["properties.bldg_no"],
                                                                                            "ABBREV": row["properties.ABBREV"],
                                                                                            "NAME": row["properties.NAME"],
                                                                                            "Address": row["properties.Address"],
                                                                                            "CAMPUS": row["properties.CAMPUS"],
                                                                                            "location": row["properties.location"],
                                                                                            "id": row["properties.id"],
                                                                                            "departments": row["properties.departments"],
                                                                                            "fill": row["properties.fill"]
                                                                                            }, axis=1)
normalized_original_data_df = normalized_original_data_df.drop(columns=["properties.bldg_no", "properties.ABBREV", "properties.NAME",
                                                                        "properties.Address", "properties.CAMPUS", "properties.location",
                                                                        "properties.id", "properties.departments", "properties.fill"])

normalized_original_data_df["geometry"] = normalized_original_data_df.apply(lambda row: {"type": row["geometry.type"], "coordinates": row["geometry.coordinates"]}, axis=1)

normalized_original_data_df = normalized_original_data_df.drop(columns=["geometry.type", "geometry.coordinates"])

compressed_data = {
    "type": "FeatureCollection",
    "features": normalized_original_data_df.to_dict(orient="records")
}

with open("output-files/geojson.json", "w") as file:
    json.dump(compressed_data, file, indent=4)