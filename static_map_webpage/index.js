let map;
let dataLayer;
let config;
let baseLayers = {};
let selectedLayer = null;
let userMovedMap = false; // once someone pans or zooms, refreshes stop reframing the map

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// Matches the small-map rules in index.css: controls hide while a popup is open
const smallMap = window.matchMedia('(max-width: 560px), (max-height: 480px)');

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
    dragging: !(embedded && L.Browser.mobile),
    // Canvas with a click tolerance: zoomed out, many buildings are under 10px wide
    renderer: L.canvas({ tolerance: window.matchMedia('(pointer: coarse)').matches ? 10 : 5 })
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  if (embedded)
    setupEmbedMode();

  setupCampusSwitcher();
  frameAll(false);

  const container = map.getContainer();
  ['pointerdown', 'wheel', 'keydown'].forEach(type =>
    container.addEventListener(type, () => { userMovedMap = true; }, { passive: true }));
  map.on('zoomend', restyleBuildings);
  setupBrowseList();

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

  // Click only: keyboard focus already gets arrow-key panning, and shouldn't quietly turn on wheel zoom
  map.on('click', activate);
  container.addEventListener('mouseleave', deactivate);
  window.addEventListener('blur', deactivate); // user clicked back into the host page
  container.addEventListener('wheel', () => {
    if (!map.scrollWheelZoom.enabled()) showHint();
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && !map.dragging.enabled()) showHint();
  }, { passive: true });

  // Link out to the standalone map (opened top-level, so embed mode turns off). Bottom right, above
  // the attribution: in the top corners it collides with the title card on phones.
  const fullMapUrl = new URL(window.location.href);
  fullMapUrl.searchParams.delete('embed');
  const FullMapControl = L.Control.extend({
    onAdd: function() {
      const link = L.DomUtil.create('a', 'full-map-link');
      link.href = fullMapUrl.toString();
      link.target = '_blank';
      link.rel = 'noopener';
      link.innerHTML = '<span class="label-long">Open full map</span><span class="label-short">Full map</span>'
        + '<span class="visually-hidden"> (opens in a new tab)</span>'
        + '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M4 2.5h5.5V8M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      L.DomEvent.disableClickPropagation(link);
      return link;
    }
  });
  new FullMapControl({ position: 'bottomright' }).addTo(map);
}

// Campus buttons ("All", "City", ...) in the bottom-left corner
function setupCampusSwitcher() {
  const campuses = (config.campuses || []).filter(campus => campus.switcher !== false);
  if (campuses.length === 0)
    return;

  const Switcher = L.Control.extend({
    onAdd: function() {
      const group = L.DomUtil.create('div', 'campus-switcher');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Zoom to a campus');
      const addButton = (label, title, onClick) => {
        const button = L.DomUtil.create('button', '', group);
        button.type = 'button';
        button.textContent = label;
        button.title = title;
        button.addEventListener('click', onClick);
      };
      if (config.map.fit_bounds)
        addButton('All', 'All Lincoln campuses', () => frameAll(true));
      campuses.forEach(campus =>
        addButton(campus.label || campus.name, campus.name, () => frameCampus(campus)));
      L.DomEvent.disableClickPropagation(group);
      L.DomEvent.disableScrollPropagation(group);
      return group;
    }
  });
  new Switcher({ position: 'bottomleft' }).addTo(map);
}

// Room to leave around a framed area so no building lands under the title card or the bottom controls.
// Wide maps have the card in the top-left corner, so reserve its height or its width, whichever costs less.
function framePadding(bounds) {
  const panel = document.getElementById('panel');
  const size = map.getSize();
  const bottom = bottomControlsHeight() + 8;
  const byTop = { paddingTopLeft: [12, panel.offsetTop + panel.offsetHeight + 12], paddingBottomRight: [12, bottom] };
  if (size.x <= 560)
    return byTop;
  const byLeft = { paddingTopLeft: [panel.offsetLeft + panel.offsetWidth + 12, 16], paddingBottomRight: [56, bottom] };
  const zoomWith = pad => map.getBoundsZoom(bounds, false, L.point(pad.paddingTopLeft).add(pad.paddingBottomRight));
  return zoomWith(byLeft) > zoomWith(byTop) ? byLeft : byTop;
}

function bottomControlsHeight() {
  const corners = map.getContainer().querySelectorAll('.leaflet-bottom');
  return Math.max(0, ...[...corners].map(corner => corner.offsetHeight));
}

function frameBounds(bounds, animate) {
  bounds = L.latLngBounds(bounds);
  map.closePopup();
  const options = { ...framePadding(bounds), maxZoom: 17 };
  if (animate && !reducedMotion.matches)
    map.flyToBounds(bounds, { ...options, duration: 0.6 });
  else
    map.fitBounds(bounds, { ...options, animate: false });
}

function frameAll(animate) {
  if (config.map.fit_bounds)
    frameBounds(config.map.fit_bounds, animate);
}

// Frame the buildings shown on a campus (tighter than its whole area)
function frameCampus(campus) {
  const layers = dataLayer ? buildingsOnCampus(campus) : [];
  const bounds = layers.length > 0
    ? layers.reduce((acc, layer) => acc.extend(layer.getBounds()), L.latLngBounds(layers[0].getBounds()))
    : L.latLngBounds(campus.area);
  frameBounds(bounds, true);
}

function campusOf(layer) {
  const center = layer.getBounds().getCenter();
  return (config.campuses || []).find(campus => L.latLngBounds(campus.area).contains(center)) || null;
}

function buildingsOnCampus(campus) {
  return dataLayer.getLayers().filter(layer => campusOf(layer) === campus);
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

  // Filter buildings based on config. HCC buildings go last so they draw on top and win clicks
  // where their click tolerance overlaps a neighbor's.
  const usesHcc = feature => feature.properties.member_departments.length > 0;
  const filteredFeatures = buildingData.features.filter(shouldIncludeBuilding)
    .sort((a, b) => usesHcc(a) - usesHcc(b));
  const filteredGeoJson = {
    ...buildingData,
    features: filteredFeatures
  };

  // Add new GeoJSON layer with styling from config
  selectedLayer = null;
  dataLayer = L.geoJSON(filteredGeoJson, {
    style: feature => buildingStyle(feature),
    onEachFeature: function(feature, layer) {
      // Registered before bindPopup's own click handler, so the padding is current when it opens
      layer.on('click', () => preparePopup(layer));
      layer.bindPopup(() => buildPopup(feature.properties), {
        className: 'building-popup',
        minWidth: 240,
        maxWidth: 300
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
        popupopen: (e) => {
          selectedLayer = layer;
          document.body.classList.add('popup-open');
          layer.closeTooltip();
          layer.setStyle(buildingStyle(feature, true));
          layer.bringToFront();
          setupPopupKeys(e.popup);
        },
        popupclose: () => {
          selectedLayer = null;
          document.body.classList.remove('popup-open');
          layer.setStyle(buildingStyle(feature));
          returnFromPopup(layer);
        }
      });
    }
  });
  return dataLayer;
}

// Before a building's popup opens: close the building list, then keep the popup clear of the title
// card and the controls. On small maps the controls hide while a popup is open, and on short maps
// the card fades out too (body.popup-open in index.css), so the popup can use that space.
function preparePopup(layer) {
  closeBrowseList();
  const panel = document.getElementById('panel');
  const size = map.getSize();
  const top = size.y <= 480 ? 12 : panel.offsetTop + panel.offsetHeight + 12;
  const bottom = smallMap.matches ? 24 : bottomControlsHeight() + 8;
  L.setOptions(layer.getPopup(), {
    autoPanPaddingTopLeft: [12, top],
    autoPanPaddingBottomRight: [12, bottom],
    // Long department lists scroll inside the popup instead of running off the map
    maxHeight: Math.max(160, size.y - top - bottom - 40)
  });
}

function buildingStyle(feature, highlighted = false) {
  const usesHcc = feature.properties.member_departments.length > 0;
  const style = usesHcc ? config.styling.with_hcc : config.styling.without_hcc;
  const hover = config.styling.hover || {};
  // Zoomed out, a same-color outline grows HCC buildings so they don't shrink to specks
  const grow = usesHcc ? lowZoomGrowth(style) : 0;

  return {
    fillColor: style.fill_color,
    fillOpacity: highlighted ? Math.min(1, style.fill_opacity + (hover.fill_opacity_boost ?? 0.15)) : style.fill_opacity,
    color: grow > 0 && !highlighted ? style.fill_color : style.stroke_color,
    opacity: grow > 0 && !highlighted ? style.fill_opacity : 1,
    weight: style.stroke_weight + grow + (highlighted ? hover.extra_stroke_weight ?? 1.5 : 0)
  };
}

function lowZoomGrowth(style) {
  const below = style.grow_below_zoom;
  if (!below || !map)
    return 0;
  return Math.min(style.grow_max_weight ?? 3, Math.max(0, (below - map.getZoom()) * 1.5));
}

function restyleBuildings() {
  if (dataLayer)
    dataLayer.eachLayer(layer => layer.setStyle(buildingStyle(layer.feature, layer === selectedLayer)));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function pluralize(count, word) {
  return `${count} ${count === 1 ? word : word + 's'}`;
}

// " in the past year" for 365 days, " in the past 14 days" otherwise, "" when unset
function usageWindowPhrase() {
  const days = config.usage_window_days;
  if (!days) return '';
  if (days % 365 === 0) return days === 365 ? ' in the past year' : ` in the past ${days / 365} years`;
  return ` in the past ${days} days`;
}

// Popup card: building code and name, a one-line HCC summary, then the departments.
// Any other keys listed in display.popup_properties are shown in a small table underneath.
function buildPopup(props) {
  const shown = config.display.popup_properties;
  const allDepts = props.departments || [];
  const memberDepts = props.member_departments || [];
  const usesHcc = memberDepts.length > 0;
  const timeframe = usageWindowPhrase() || ' recently';
  const otherClass = usesHcc ? '' : ' is-other';

  // Name before code in the DOM so screen readers start with the name; CSS shows the code tag first
  let head = '';
  if (shown.includes('name') && props.name)
    head += `<h2 class="bp-name" tabindex="-1">${escapeHtml(props.name)}</h2>`;
  if (shown.includes('abbrev') && props.abbrev)
    head += `<span class="code-tag${otherClass}"><span class="visually-hidden">Building code </span>${escapeHtml(props.abbrev)}</span>`;

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

// Buildings list: the map's text alternative, and a quicker way to find one building than panning.
// Opening a building from the list goes to it and moves focus into its popup; closing that popup
// with × or Escape comes back to the same place in the list.
let browseReturnId = null;
let popupClosedByUser = false;

function setupBrowseList() {
  const toggle = document.getElementById('browse-toggle');
  const list = document.getElementById('browse');
  toggle.addEventListener('click', () => isBrowseOpen() ? closeBrowseList() : openBrowseList());
  list.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-building]');
    if (button)
      showBuilding(button);
  });
  document.getElementById('panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isBrowseOpen()) {
      closeBrowseList();
      toggle.focus();
    }
  });
}

function fillBrowseList() {
  const list = document.getElementById('browse');
  const hccLayers = dataLayer.getLayers().filter(layer => layer.feature.properties.member_departments.length > 0);
  const groups = new Map((config.campuses || []).map(campus => [campus.name, []]));
  groups.set('Other locations', []);
  hccLayers.forEach(layer => groups.get(campusOf(layer)?.name ?? 'Other locations').push(layer));

  const byName = (a, b) => (a.feature.properties.name || '').localeCompare(b.feature.properties.name || '');
  const item = layer => {
    const props = layer.feature.properties;
    return `<li><button type="button" data-building="${L.stamp(layer)}">`
      + `<span class="code-tag" aria-hidden="true">${escapeHtml(props.abbrev || '')}</span>`
      + `<span class="browse-name">${escapeHtml(props.name || props.abbrev || '')}</span></button></li>`;
  };
  list.innerHTML = [...groups.entries()]
    .filter(([, layers]) => layers.length > 0)
    .map(([name, layers], i) => `<section class="browse-group" aria-labelledby="browse-group-${i}">`
      + `<h2 class="browse-campus" id="browse-group-${i}">${escapeHtml(name)}`
      + `<span class="browse-count">${layers.length}<span class="visually-hidden"> ${layers.length === 1 ? 'building' : 'buildings'}</span></span></h2>`
      + `<ul>${layers.sort(byName).map(item).join('')}</ul></section>`)
    .join('');
  document.getElementById('browse-toggle').hidden = hccLayers.length === 0;
}

function isBrowseOpen() {
  return !document.getElementById('browse').hidden;
}

function openBrowseList(focusId = null) {
  map.closePopup();
  const list = document.getElementById('browse');
  list.hidden = false;
  document.getElementById('browse-toggle').setAttribute('aria-expanded', 'true');
  const current = focusId && list.querySelector(`[data-building="${focusId}"]`);
  if (current) {
    current.focus({ preventScroll: true });
    current.scrollIntoView({ block: 'nearest' });
  }
}

function closeBrowseList() {
  document.getElementById('browse').hidden = true;
  document.getElementById('browse-toggle').setAttribute('aria-expanded', 'false');
}

function showBuilding(button) {
  const layer = dataLayer.getLayer(Number(button.dataset.building));
  if (!layer)
    return;
  map.closePopup();
  document.querySelectorAll('#browse [aria-current]').forEach(el => el.removeAttribute('aria-current'));
  button.setAttribute('aria-current', 'true');
  browseReturnId = button.dataset.building;
  userMovedMap = true;
  preparePopup(layer);

  const center = layer.getBounds().getCenter();
  const zoom = Math.max(map.getZoom(), 16.5);
  const open = () => {
    layer.openPopup(center);
    const popup = layer.getPopup().getElement();
    popup?.querySelector('.bp-name, .leaflet-popup-close-button')?.focus({ preventScroll: true });
  };
  if (map.getZoom() >= 16 && map.getBounds().pad(-0.15).contains(center))
    open();
  else if (reducedMotion.matches) {
    map.setView(center, zoom, { animate: false });
    open();
  } else {
    map.once('moveend', open);
    map.flyTo(center, zoom, { duration: 0.8 });
  }
}

// Escape closes the popup from inside it; × or Escape on a popup opened from the list goes back to the list
function setupPopupKeys(popup) {
  const el = popup.getElement();
  if (!el || el.dataset.keysBound)
    return;
  el.dataset.keysBound = 'true';
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      popupClosedByUser = true;
      map.closePopup();
    }
  });
  // Capture phase: Leaflet's own close handler runs on the button and would close the popup first
  el.addEventListener('click', (e) => {
    if (e.target.closest('.leaflet-popup-close-button'))
      popupClosedByUser = true;
  }, true);
}

function returnFromPopup(layer) {
  const returnId = browseReturnId;
  const byUser = popupClosedByUser;
  popupClosedByUser = false;
  if (returnId !== String(L.stamp(layer)))
    return;
  browseReturnId = null;
  // After Leaflet finishes closing: openBrowseList closes popups, which mustn't re-enter this close
  if (byUser)
    setTimeout(() => openBrowseList(returnId));
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
          const info = document.getElementById("info");
          info.classList.remove("is-error");
          info.innerHTML = `<strong>${departmentCount}</strong> departments in <strong>${hccBuildingCount}</strong> buildings ran jobs on HCC${usageWindowPhrase()}.`;

          const lastUpdate = new Date(usageJSON.last_updated);
          document.getElementById("updated").textContent = `Updated ${lastUpdate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

          // Add new GeoJSON layer to the map
          dataLayer.addTo(map);
          fillBrowseList();

          // The title card just grew from its one-line loading state, so reframe unless someone has moved the map
          if (!userMovedMap)
            frameAll(false);
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