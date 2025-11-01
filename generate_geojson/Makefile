.ONESHELL:

PYTHON = ./venv/bin/python
PIP = ./venv/bin/pip

run: venv
	$(PYTHON) generate_geojson.py

venv: venv/bin/activate
	. venv/bin/activate

venv/bin/activate: requirements.txt
	python -m venv venv
	. venv/bin/activate
	$(PIP) install -r requirements.txt

clean:
	rm -Rf __pycache__
	rm -Rf venv
	rm output-files/geojson.json