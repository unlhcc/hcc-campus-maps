let map;
let dataLayer;
let config;
let baseLayers = {};

// Base layer definitions
const baseLayerDefinitions = {
  campus: {
    // OpenStreetMap, desaturated in index.css (.tiles-campus) so the buildings stand out
    layer: () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: 'tiles-campus'
    }),
    label: 'Campus'
  },
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
    
    initMap();
  } catch (error) {
    console.error('Error loading configuration:', error);
    showError(`Couldn't load the map settings (${error.message}). Reload the page to try again.`);
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

  const embedded = isEmbedded();
  if (embedded)
    document.body.classList.add('embed');

  // Initialize map with config settings
  map = L.map('map', {
    center: [config.map.center.lat, config.map.center.lng],
    zoom: config.map.zoom,
    layers: [defaultLayer],
    zoomControl: false,
    zoomSnap: 0.25,
    // When embedded, don't hijack the host page's scrolling until the map is activated
    scrollWheelZoom: !embedded,
    dragging: !(embedded && L.Browser.mobile)
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Frame the campuses. On narrow screens the title card spans the top, so leave room below it.
  if (config.map.fit_bounds) {
    const panel = document.getElementById('panel');
    const narrow = window.innerWidth <= 560;
    map.fitBounds(config.map.fit_bounds, {
      paddingTopLeft: narrow ? [8, panel.offsetHeight + 16] : [16, 16],
      paddingBottomRight: [16, 16]
    });
  }

  if (embedded)
    setupEmbedMode();

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

// Embed mode is on with ?embed=1, off with ?embed=0, and otherwise on when the page is inside an iframe
function isEmbedded() {
  const param = new URLSearchParams(window.location.search).get('embed');
  if (param !== null)
    return param !== '0' && param !== 'false';
  const autoDetect = config.embed?.auto_detect_iframe ?? true;
  return autoDetect && window.self !== window.top;
}

function setupEmbedMode() {
  const container = map.getContainer();
  const hint = document.getElementById('embed-hint');
  hint.textContent = L.Browser.mobile ? 'Tap the map to pan and zoom' : 'Click the map to zoom with the scroll wheel';
  let hintTimer;

  const showHint = () => {
    hint.classList.add('visible');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('visible'), 1500);
  };
  const activate = () => {
    map.scrollWheelZoom.enable();
    map.dragging.enable();
    hint.classList.remove('visible');
  };
  const deactivate = () => {
    map.scrollWheelZoom.disable();
    if (L.Browser.mobile)
      map.dragging.disable();
  };

  map.on('click focus', activate);
  container.addEventListener('mouseleave', deactivate);
  window.addEventListener('blur', deactivate); // user clicked back into the host page
  container.addEventListener('wheel', () => {
    if (!map.scrollWheelZoom.enabled()) showHint();
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && !map.dragging.enabled()) showHint();
  }, { passive: true });

  // Link out to the standalone map (opened top-level, so embed mode turns off)
  const fullMapUrl = new URL(window.location.href);
  fullMapUrl.searchParams.delete('embed');
  const FullMapControl = L.Control.extend({
    onAdd: function() {
      const link = L.DomUtil.create('a', 'full-map-link');
      link.href = fullMapUrl.toString();
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open full map \u2197';
      L.DomEvent.disableClickPropagation(link);
      return link;
    }
  });
  new FullMapControl({ position: 'topright' }).addTo(map);
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


function printUsageStats(buildingData, usageData) {
  const departmentsUsingHcc = [...new Set(usageData.map(entry => entry['Department_Canonical']))];

  // Several raw names can map to one canonical department, so only flag repeated raw names
  if (new Set(usageData.map(entry => entry['Department'])).size != usageData.length)
    console.warn("Warning: Duplicate entries found in provided usage data file.");

  // Log all departments not associated with any building
  let all_departments_in_buildings_set = buildingData.features.reduce((deptSet, feature) => {
    const buildingDepartments = feature.properties.departments || [];
    buildingDepartments.forEach(dept => deptSet.add(dept));
    return deptSet;
  }, new Set());
  let all_departments_not_in_buildings_set = new Set(departmentsUsingHcc.filter(dept => !all_departments_in_buildings_set.has(dept)));
  console.log("All departments associated with buildings:", [...all_departments_in_buildings_set]);
  console.log("All departments using HCC:", [...new Set(departmentsUsingHcc)]);
  console.log("Departments using HCC but not associated with any building:", [...all_departments_not_in_buildings_set]);
  console.log("Departments in buildings using HCC:", [...all_departments_in_buildings_set].filter(dept => departmentsUsingHcc.includes(dept)));
  console.log("Departments in buildings not using HCC:", [...all_departments_in_buildings_set].filter(dept => !departmentsUsingHcc.includes(dept)));
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
  let selectedLayer = null;
  // Pan opened popups clear of the title card. On short maps there isn't room, so the card
  // fades out while a popup is open instead (body.popup-open in index.css).
  const panel = document.getElementById('panel');
  const shortMap = map.getSize().y <= 480;
  const popupPaddingTopLeft = shortMap ? [16, 16] : [16, panel.offsetHeight + 20];
  dataLayer = L.geoJSON(filteredGeoJson, {
    style: buildingStyle,
    onEachFeature: function(feature, layer) {
      layer.bindPopup(() => buildPopup(feature.properties), {
        className: 'building-popup',
        minWidth: 240,
        maxWidth: 300,
        autoPanPaddingTopLeft: popupPaddingTopLeft
      });

      // Hover labels only where there is a pointer to hover with
      if (!L.Browser.mobile)
        layer.bindTooltip(feature.properties.name || '', {
          className: 'building-tooltip',
          direction: 'top',
          sticky: true,
          offset: [0, -8]
        });

      layer.on({
        mouseover: () => layer.setStyle(buildingStyle(feature, true)),
        mouseout: () => {
          if (layer !== selectedLayer)
            layer.setStyle(buildingStyle(feature));
        },
        popupopen: () => {
          selectedLayer = layer;
          document.body.classList.add('popup-open');
          layer.closeTooltip();
          layer.setStyle(buildingStyle(feature, true));
          layer.bringToFront();
        },
        popupclose: () => {
          selectedLayer = null;
          document.body.classList.remove('popup-open');
          layer.setStyle(buildingStyle(feature));
        }
      });
    }
  });
  return dataLayer;
}

function buildingStyle(feature, highlighted = false) {
  const usesHcc = feature.properties.member_departments.length > 0;
  const style = usesHcc ? config.styling.with_hcc : config.styling.without_hcc;
  const hover = config.styling.hover || {};

  return {
    fillColor: style.fill_color,
    fillOpacity: highlighted ? Math.min(1, style.fill_opacity + (hover.fill_opacity_boost ?? 0.15)) : style.fill_opacity,
    color: style.stroke_color,
    weight: highlighted ? style.stroke_weight + (hover.extra_stroke_weight ?? 1.5) : style.stroke_weight
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function pluralize(count, word) {
  return `${count} ${count === 1 ? word : word + 's'}`;
}

// Popup card: building code and name, a one-line HCC summary, then the departments.
// Any other keys listed in display.popup_properties are shown in a small table underneath.
function buildPopup(props) {
  const shown = config.display.popup_properties;
  const allDepts = props.departments || [];
  const memberDepts = props.member_departments || [];
  const usesHcc = memberDepts.length > 0;
  const days = config.usage_window_days;
  const timeframe = days ? ` in the past ${days} days` : ' recently';
  const otherClass = usesHcc ? '' : ' is-other';

  let head = '';
  if (shown.includes('abbrev') && props.abbrev)
    head += `<span class="code-tag${otherClass}">${escapeHtml(props.abbrev)}</span>`;
  if (shown.includes('name') && props.name)
    head += `<h2 class="bp-name">${escapeHtml(props.name)}</h2>`;

  let body = '';
  if (shown.includes('departments') && allDepts.length > 0) {
    const status = usesHcc
      ? `${memberDepts.length} of ${pluralize(allDepts.length, 'department')} here ran jobs on HCC${timeframe}`
      : `No departments here ran jobs on HCC${timeframe}`;
    head += `<p class="bp-status">${status}</p>`;

    // HCC departments first, then the rest
    const others = allDepts.filter(dept => !memberDepts.includes(dept));
    body += '<ul class="bp-depts">'
      + memberDepts.map(dept => `<li class="is-hcc">${escapeHtml(dept)}</li>`).join('')
      + others.map(dept => `<li>${escapeHtml(dept)}</li>`).join('')
      + '</ul>';
  }

  const extras = shown.filter(key => !['name', 'abbrev', 'departments'].includes(key) && props[key] != null);
  if (extras.length > 0) {
    body += '<dl class="bp-extra">' + extras.map(key => {
      const value = Array.isArray(props[key]) ? props[key].join(', ') : props[key];
      return `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`;
    }).join('') + '</dl>';
  }

  return `<article class="bp${otherClass}"><header class="bp-head">${head}</header>${body}</article>`;
}

function showError(message) {
  const info = document.getElementById('info');
  info.textContent = message;
  info.classList.add('is-error');
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
    .then((buildingGeoJSON) => {
      return fetch(`${config.departments_using_hcc_url}?t=${timestamp}`) // Cache busting
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((usageJSON) => {
          // Remove the previous GeoJSON layer (from an earlier refresh) before replacing it
          if (dataLayer) {
            map.removeLayer(dataLayer);
          }
          dataLayer = generateDataLayer(buildingGeoJSON, usageJSON.departments_completing_jobs);

          if (config.show_usage_stats_in_console)
            printUsageStats(buildingGeoJSON, usageJSON.departments_completing_jobs);

          // Update the title card
          // Count canonical departments; the data has one entry per raw name variant (e.g. "Phys", "Physics")
          const departmentCount = new Set(usageJSON.departments_completing_jobs.map(entry => entry['Department_Canonical'])).size;
          const hccBuildingCount = dataLayer.getLayers().filter(layer => layer.feature.properties.member_departments.length > 0).length;
          const days = config.usage_window_days;
          const info = document.getElementById("info");
          info.classList.remove("is-error");
          info.innerHTML = `<strong>${departmentCount}</strong> departments in <strong>${hccBuildingCount}</strong> buildings ran jobs on HCC${days ? ` in the past ${days} days` : ''}.`;

          const lastUpdate = new Date(usageJSON.last_updated);
          document.getElementById("updated").textContent = `Updated ${lastUpdate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

          // Add new GeoJSON layer to the map
          dataLayer.addTo(map);
        })
    })
    .catch((error) => {
      console.error("Error loading GeoJSON:", error);
      showError(`Couldn't load building data (${error.message}). Reload the page to try again.`);
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