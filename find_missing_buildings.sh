#!/bin/bash

# Check for required arguments
# if [ "$#" -ne 1 ]; then
#     echo "Usage: $0 <path_to_geojson_file>"
#     echo ""
#     echo "Example: $0 /path/to/buildings.geojson"
#     exit 1
# fi

GEOJSON_FILE="./data/output/buildings.geojson"
DEPARTMENTS_FILE="./data/maps/departments_per_building.json"

# Check if files exist
if [ ! -f "$GEOJSON_FILE" ]; then
    echo "Error: GeoJSON file not found: $GEOJSON_FILE"
    exit 1
fi

if [ ! -f "$DEPARTMENTS_FILE" ]; then
    echo "Error: Departments file not found: $DEPARTMENTS_FILE"
    exit 1
fi

# Extract building names from GeoJSON (from the NAME property)
echo "Extracting buildings from GeoJSON..."
geojson_buildings=$(jq -r '.features[].properties.NAME' "$GEOJSON_FILE" 2>/dev/null | sort -u)

if [ -z "$geojson_buildings" ]; then
    echo "Error: Could not read GeoJSON file or no buildings found"
    echo "Make sure the GeoJSON has features with properties.NAME"
    exit 1
fi

# Extract building names from building_departments.json
echo "Extracting buildings from departments_per_building.json..."
json_buildings=$(jq -r '.building_departments | keys[]' "$DEPARTMENTS_FILE" | sort -u)

# Create temporary files
geojson_temp=$(mktemp)
json_temp=$(mktemp)

echo "$geojson_buildings" > "$geojson_temp"
echo "$json_buildings" > "$json_temp"

# Find buildings in GeoJSON but not in departments JSON
echo ""
echo "=========================================="
echo "Buildings in GeoJSON but NOT in departments_per_building.json:"
echo "=========================================="

missing_count=0
while IFS= read -r building; do
    if ! grep -Fxq "$building" "$json_temp"; then
        echo "  - $building"
        ((missing_count++))
    fi
done < "$geojson_temp"

echo ""
if [ $missing_count -eq 0 ]; then
    echo "✓ All buildings are accounted for!"
else
    echo "Total missing: $missing_count buildings"
fi
echo ""

# Also show total counts for context
geojson_count=$(wc -l < "$geojson_temp")
json_count=$(wc -l < "$json_temp")

echo "Summary:"
echo "  Buildings in GeoJSON: $geojson_count"
echo "  Buildings in departments JSON: $json_count"
echo "  Buildings missing from departments JSON: $missing_count"

# Clean up
rm "$geojson_temp" "$json_temp"