# Campus Swan & NRDStor Usage

This project provides geo-json that highlights the buildings on UNL's campuses currently utilizing either NRDStor or Swan.

---

## Getting Started

We assume that anyone contributing to this repo will be working in their Swan account.

The program, `generate_geojson.py` takes `map_data.json` and `map_groups_to_departments.csv` as input and generates an output file called `geojson.json`.

`map_data.json` contains the original campus map geo-json found on `https://maps.unl.edu/`.

`map_groups_to_departments.csv` contains a mapping between UNL departments and buildings.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/unlhcc/hcc-campus-maps.git

2. Navigate to project directory:
   ```bash
   cd hcc-campus-maps

### Execution
1. Run `make`. This will create a virtual python environment and install all necessary libraries found in `requirements.txt`. The python program will then be run, and `geojson.json` will be generated as output.
    ```bash
    make

### Testing
Take the geojson generated in `geojson.json` and place it in `https://geojson.io/#map=2/0/20`. You should now see the UNL campus buildings either highlighted or not depending on if they're using NRDStor or Swan.
