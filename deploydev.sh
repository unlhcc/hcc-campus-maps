#!/bin/bash

# GeoJSON Map Viewer - Local Development Server
# For production deployment with HTTPS, use deploy-nginx.sh instead
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
GEOJSON_PATH="$DEPLOY_SCRIPT_DIR/static_map_webpage/buildings_using_hcc.geojson"
cd "$DEPLOY_SCRIPT_DIR/scripts"

echo "==============================="
echo "   Deploying $PROJECT_NAME"
echo "==============================="

# I need to create/activate my conda environment here. I have a requirements.txt for the pip libraries, but I also need to install mysql

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
  print_error "Python 3 is required but not found. Please install Python 3."
  exit 1
fi

if [ -t 0 ]; then
  # Interactive terminal
  read -p "Do you want to generate a new hcc usage geojson? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Generate initial GeoJSON data
    print_step "Running HCC usage GeoJSON generation now..."

    cd "$DEPLOY_SCRIPT_DIR"
    if python3 scripts/generate_hcc_usage_geojson.py "$GEOJSON_PATH" >> "$DEPLOY_SCRIPT_DIR/scripts/generate_hcc_usage_geojson.log" 2>&1; then
      grep -c "uses_hcc\": true" "$GEOJSON_PATH" | \
        xargs -I {} echo "Generated GeoJSON with {} buildings using HCC."
      print_step "Initial GeoJSON generation completed successfully"
    else
      print_error "Failed to generate initial GeoJSON. Check the log file."
    fi
  else
    print_warning "Skipping initial geojson generation."
  fi
fi



# Setup cron job
setup_cron() {
  print_step "Setting up cron job (runs every 6 hours)..."
  
  # Create a cron entry
  CRON_CMD="0 */6 * * * cd $DEPLOY_SCRIPT_DIR && python3 scripts/generate_hcc_usage_geojson.py >> $DEPLOY_SCRIPT_DIR/scripts/generate_hcc_usage_geojson.log 2>&1"
  
  # Check if cron entry already exists
  if crontab -l 2>/dev/null | grep -q "scripts/generate_hcc_usage_geojson.py"; then
    print_warning "Cron job already exists. Skipping cron setup."
  else
    # Add to crontab
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    print_step "Cron job added successfully"
  fi
  
  echo ""
  echo "Cron job will run every 6 hours at: 00:00, 06:00, 12:00, 18:00"
  echo "To view your cron jobs: crontab -l"
  echo "To remove the cron job: crontab -e (then delete the line with generate_hcc_usage_geojson.py)"
}

# Detect if running on a server where cron makes sense
if [ -t 0 ]; then
  # Interactive terminal
  read -p "Do you want to set up the cron job? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    setup_cron
  else
    print_warning "Skipping cron setup. You can run 'python3 scripts/generate_hcc_usage_geojson.py' manually."
  fi
else
  # Non-interactive (e.g., automated deployment)
  setup_cron
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
echo "For production deployment with HTTPS, use: sudo ./deploy-nginx.sh"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start Python's built-in HTTP server
cd "$DEPLOY_SCRIPT_DIR"/static_map_webpage
python3 -m http.server $PORT