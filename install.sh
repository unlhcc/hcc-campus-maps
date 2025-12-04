#!/bin/bash

# Creates conda environment and generates building geojson
set -e

echo "==========================="
echo "   Installing HCC Map      "
echo "==========================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
  echo -e "${GREEN}==>${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}WARNING:${NC} $1"
}

print_error() {
  echo -e "${RED}ERROR:${NC} $1"
}

# Get script directory
INSTALL_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$INSTALL_SCRIPT_DIR"

# Check if conda is installed
print_step "Checking for conda installation..."
if ! command -v conda &> /dev/null; then
  print_error "Conda is required but not installed."
  echo ""
  echo "Please install Miniconda or Anaconda:"
  exit 1
fi

# Check if environment.yml exists
if [ ! -f "environment.yml" ]; then
  print_error "environment.yml not found in current directory."
  exit 1
fi

# Get environment name from environment.yml
ENV_NAME=$(grep "^name:" environment.yml | awk '{print $2}')

if [ -z "$ENV_NAME" ]; then
  print_error "Could not determine environment name from environment.yml"
  exit 1
fi

print_step "Environment name: $ENV_NAME"

# Check if environment already exists
if conda env list | grep -q "^$ENV_NAME "; then
  print_warning "Conda environment '$ENV_NAME' already exists."
  read -p "Do you want to remove and recreate it? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_step "Removing existing environment..."
    conda env remove -n "$ENV_NAME" -y
  else
    print_step "Updating existing environment..."
    conda env update -n "$ENV_NAME" -f environment.yml --prune
    print_step "Environment updated successfully"
    
    # Activate and generate data
    print_step "Generating initial GeoJSON data..."
    eval "$(conda shell.bash hook)"
    conda activate "$ENV_NAME"
    python scripts/generate_hcc_usage_geojson.py
    
    echo ""
    echo -e "${GREEN}Installation complete!${NC}"
    echo ""
    echo "To activate the environment, run:"
    echo "  conda activate $ENV_NAME"
    exit 0
  fi
fi

# Create conda environment
print_step "Creating conda environment from environment.yml..."
conda env create -f environment.yml

print_step "Conda environment '$ENV_NAME' created successfully"

# Activate environment and generate initial data
print_step "Generating initial GeoJSON data..."

# Initialize conda for bash (needed for conda activate to work in script)
eval "$(conda shell.bash hook)"
conda activate "$ENV_NAME"

python scripts/generate_hcc_usage_geojson.py

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "To activate the environment, run:"
echo "  conda activate $ENV_NAME"
echo ""
echo "To deploy the development server, run:"
echo "  ./deploydev.sh"