let map;
let dataLayer;
let config;
let baseLayers = {};

// Base layer definitions
const baseLayerDefinitions = {
  streets: {
    layer: () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }),
    label: 'Streets'
  },
  satellite: {
    layer: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19
    }),
    label: 'Satellite'
  },
  topo: {
    layer: () => L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      maxZoom: 17
    }),
    label: 'Topographic'
  }
};

async function loadConfig() {
  try {
    const response = await fetch('map-config.yml');
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.status}`);
    }
    const yamlText = await response.text();
    config = jsyaml.load(yamlText);
    
    document.getElementById('info').innerHTML = 'Configuration loaded. Initializing map...';
    initMap();
  } catch (error) {
    console.error('Error loading configuration:', error);
    document.getElementById('info').innerHTML = `Error loading configuration: ${error.message}`;
  }
}

function initMap() {
  // Initialize base layers from config
  config.base_layers.forEach(layerKey => {
    if (baseLayerDefinitions[layerKey]) {
      baseLayers[layerKey] = baseLayerDefinitions[layerKey].layer();
    }
  });

  // Get default layer
  const defaultLayer = baseLayers[config.default_layer] || baseLayers[config.base_layers[0]];

  // Initialize map with config settings
  map = L.map('map', {
    center: [config.map.center.lat, config.map.center.lng],
    zoom: config.map.zoom,
    layers: [defaultLayer]
  });

  // Setup map type controls
  if (config.display.show_layers_control)
    setupControls();

  // Load GeoJSON data
  loadGeoJsonDataLayer();

  // Auto-refresh if configured
  if (config.refresh_interval > 0) {
    setInterval(loadGeoJsonDataLayer, config.refresh_interval);
  }
}

function shouldIncludeBuilding(feature) {
  if (feature.properties.departments === undefined || feature.properties.member_departments === undefined) {
    console.error("Feature missing departments or member_departments property:", feature);
  }

  const departments = feature.properties.departments || [];
  const memberDepartments = feature.properties.member_departments || [];

  // Exclude buildings serving only an excluded department
  if (config.departments.excluded && config.departments.excluded.length > 0) {
    const allExcluded = departments.every(dept => 
      config.departments.excluded.includes(dept)
    );
    if (departments.length > 0 && allExcluded) {
      return false;
    }
  }

  if (!config.display.show_buildings_without_departments) {
    if (departments.length === 0) {
      return false;
    }
  }

  if (!config.display.show_buildings_not_using_hcc) {
    if (memberDepartments.length === 0) {
      return false;
    }
  }

  
  return true;
}


function generateDataLayer(buildingData, usageData) {
  const departmentsUsingHcc = usageData.map(entry => entry['Department_Canonical']);

  for (let feature of buildingData.features) {
    // Add member_departments property
    const buildingDepartments = feature.properties.departments || [];
    feature.properties.member_departments = buildingDepartments.filter(dept => 
      departmentsUsingHcc.includes(dept)
    );
  }

  // Filter buildings based on config
  const filteredFeatures = buildingData.features.filter(shouldIncludeBuilding);
  const filteredGeoJson = {
    ...buildingData,
    features: filteredFeatures
  };

  // Add new GeoJSON layer with styling from config
  dataLayer = L.geoJSON(filteredGeoJson, {
    style: function(feature) {
      const usesHcc = feature.properties.member_departments.length > 0;
      const style = usesHcc ? config.styling.with_hcc : config.styling.without_hcc;
      
      return {
        fillColor: style.fill_color,
        fillOpacity: style.fill_opacity,
        color: style.stroke_color,
        weight: style.stroke_weight
      };
    },
    onEachFeature: function(feature, layer) {
      // Create popup content based on configured properties
      let content = '<div style="padding: 10px;">';
      if (feature.properties) {
        const memberDepts = feature.properties.member_departments || [];

        // Show properties in the order specified in config
        config.display.popup_properties.forEach(key => {
          if (feature.properties.hasOwnProperty(key)) {
            let value;
            
            // Special handling for departments to highlight HCC users
            if (key === 'departments' && Array.isArray(feature.properties[key])) {
              const allDepts = feature.properties[key];
              const nonMemberDepts = allDepts.filter(dept => !memberDepts.includes(dept));
              
              // Member departments first (in red), then non-members
              const redDepts = memberDepts.map(dept => 
                `<span style="color: ${config.styling.with_hcc.stroke_color}; font-weight: bold;">${dept}</span>`
              );
              
              value = [...redDepts, ...nonMemberDepts].join(', ');
            } else if (Array.isArray(feature.properties[key])) {
              value = feature.properties[key].join(', ');
            } else {
              value = feature.properties[key];
            }
            content += `<li><strong>${key}:</strong> ${value}</li>`;
          }
        });
      }

      content += "</ul></div>";
      layer.bindPopup(content);
    }
  });
  return dataLayer;
}

function loadGeoJsonDataLayer() {
  const timestamp = new Date().getTime();
  fetch(`${config.buildings_geojson_url}?t=${timestamp}`) // Cache busting
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((buildingData) => {
      fetch(`${config.departments_using_hcc_url}?t=${timestamp}`) // Cache busting
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((usageData) => {
          dataLayer = generateDataLayer(buildingData, usageData);
          // Remove existing GeoJSON layer if it exists
          if (dataLayer) {
            map.removeLayer(dataLayer);
          }

          // Update info
          const featureCount = buildingData['buildings'].features.length;
          const lastUpdate = new Date().toLocaleString();
          document.getElementById(
            "info"
          ).innerHTML = `Buildings:${featureCount} | Departments Using HCC: ${usageData.length} | Last updated: ${lastUpdate}`;

          // Add new GeoJSON layer to the map
          dataLayer.addTo(map);
        })
    })
    .catch((error) => {
      console.error("Error loading GeoJSON:", error);
      document.getElementById(
        "info"
      ).innerHTML = `Error loading data: ${error.message}`;
    });
}

function setupControls() {
  const controlsDiv = document.getElementById('controls');
  controlsDiv.innerHTML = ''; // Clear existing controls

  // Create buttons for each configured base layer
  config.base_layers.forEach((layerKey, index) => {
    if (baseLayerDefinitions[layerKey]) {
      const button = document.createElement('button');
      button.id = `${layerKey}Btn`;
      button.textContent = baseLayerDefinitions[layerKey].label;
      
      // Set default layer as active
      if (layerKey === config.default_layer) {
        button.classList.add('active');
      }

      button.addEventListener('click', function() {
        // Remove all other layers
        Object.keys(baseLayers).forEach(key => {
          if (key !== layerKey) {
            map.removeLayer(baseLayers[key]);
          }
        });
        
        // Add selected layer
        map.addLayer(baseLayers[layerKey]);
        updateActiveButton(this);
      });

      controlsDiv.appendChild(button);
    }
  });
}

function updateActiveButton(activeBtn) {
  document.querySelectorAll(".controls button").forEach((btn) => {
    btn.classList.remove("active");
  });
  activeBtn.classList.add("active");
}

// Load config and initialize map when page loads
loadConfig();