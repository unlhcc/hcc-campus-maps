#!/bin/bash

# Creates python virtual environment, generates building geojson
set -e

echo "==========================="
echo "   Installing HCC Map      "
echo "==========================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "Checking Python..."
if ! command -v python3 &> /dev/null; then
  echo -e "${RED}Python 3 is required but not installed.${NC}"
  echo "Please install Python 3 and try again."
  exit 1
fi

echo -e "Generating initial GeoJSON data..."
python3 scripts/generate_hcc_usage_geojson.py

