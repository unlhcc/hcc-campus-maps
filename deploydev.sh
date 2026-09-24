#!/bin/bash

# GeoJSON Map Viewer - Local Development Server
# Production is deployed to GitHub Pages by .github/workflows/pages.yml
# This script is for local development and testing only

set -e

# Configuration
PROJECT_NAME="geojson-map-viewer"
DEFAULT_PORT=8000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
  echo -e "${GREEN}==>${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}WARNING:${NC} $1"
}

print_error() {
  echo -e "${RED}ERROR:${NC} $1"
}

# Get the directory where this bash script is located
DEPLOY_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
GEOJSON_PATH="$DEPLOY_SCRIPT_DIR/static_map_webpage/buildings.geojson"
cd "$DEPLOY_SCRIPT_DIR/scripts"

echo "==============================="
echo "   Deploying $PROJECT_NAME"
echo "==============================="

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
  print_error "Python 3 is required but not found. Please install Python 3."
  exit 1
fi

# Department data is published daily from HCC (scripts/publish_departments.sh) and deployed by
# GitHub Actions, so there's no cron here. Building outlines can be refreshed locally since
# maps.unl.edu is public.
if [ -t 0 ]; then
  read -p "Do you want to re-scrape building outlines from maps.unl.edu? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_step "Scraping building outlines..."
    cd "$DEPLOY_SCRIPT_DIR"
    if python3 scripts/fetch_buildings.py "$GEOJSON_PATH" > "$DEPLOY_SCRIPT_DIR/scripts/fetch_buildings.log" 2>&1; then
      print_step "Building outlines saved to $GEOJSON_PATH"
    else
      print_error "Failed to scrape buildings. Check scripts/fetch_buildings.log"
    fi
  fi
fi

# Start web server
print_step "Starting web server..."

# Check what port to use
if [ -n "$1" ]; then
  PORT=$1
else
  PORT=$DEFAULT_PORT
fi

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  print_warning "Port $PORT is already in use. Trying to find an available port..."
  PORT=$((PORT + 1))
  while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
    PORT=$((PORT + 1))
  done
fi

echo ""
echo "=========================================="
echo "  $PROJECT_NAME is ready!"
echo "=========================================="
echo ""
echo "Access the map viewer at:"
echo "  http://localhost:$PORT"
echo ""
echo ""
echo "⚠️  NOTE: This is for LOCAL DEVELOPMENT only (HTTP, not HTTPS)"
echo "Production is deployed to GitHub Pages by .github/workflows/pages.yml"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start Python's built-in HTTP server
cd "$DEPLOY_SCRIPT_DIR"/static_map_webpage
python3 -m http.server $PORT