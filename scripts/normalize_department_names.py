import json
import pandas as pd
from pathlib import Path

DEFAULT_NORMALIZATION_MAP_PATH = Path(__file__).parent.parent / 'data' / 'maps' / 'department_normalization_map.json'

def load_department_normalization_map(json_path):
  """Load the department normalization mapping from JSON file."""
  with open(json_path, 'r') as f:
    data = json.load(f)
  return data['mappings']


def normalize_department_name(dept_name, normalization_map):
  """
  Normalize a single department name using the normalization map.
  
  Args:
    dept_name: The department name to normalize
    normalization_map: Dictionary mapping normalized names to canonical names
      
  Returns:
    The canonical department name, or the original if no mapping found
  """
  if pd.isna(dept_name) or str(dept_name).strip() == "":
    return None
  
  # Normalize the input
  normalized = (
    str(dept_name)
    .strip()
    .lower()
    .replace("&", "and")
    .replace("  ", " ")  # Remove double spaces
  )
  
  # Look up in the mapping
  canonical = normalization_map.get(normalized, dept_name)
  
  return canonical


def apply_department_normalization(df, dept_column='Department', 
                                   json_path=DEFAULT_NORMALIZATION_MAP_PATH,
                                   output_column='Department_Canonical'):
  """
  Apply department normalization to a DataFrame.
  
  Args:
    df: DataFrame with department names
    dept_column: Name of the column containing department names
    json_path: Path to the normalization JSON file
    output_column: Name of the column to store canonical names
      
  Returns:
    DataFrame with new column containing canonical department names
  """
  normalization_map = load_department_normalization_map(json_path)
  
  df[output_column] = df[dept_column].apply(
    lambda x: normalize_department_name(x, normalization_map)
  )
  
  return df


if __name__ == "__main__":
  # Test with the provided department list
  test_departments = [
    'Biochem and Molecular Biology', 'Animal Breeding and Genetics',
    'Mechanical and Materials Engineering', 'Food Science', 'Comp Sci',
    'Phys', 'Foodscience', 'DEPARTMENT OF AGRONOMY AND HORTICULTURE',
    'Chem Eng', 'PSI'
  ]
  
  normalization_map = load_department_normalization_map(DEFAULT_NORMALIZATION_MAP_PATH)
  
  print("Testing department normalization:")
  print("-" * 70)
  for dept in test_departments:
    canonical = normalize_department_name(dept, normalization_map)
    print(f"{dept:50} -> {canonical}")
