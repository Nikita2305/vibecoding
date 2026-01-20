let map;
let currentTime = 0;
let timeline = [];
let geocoded = [];
let route = [];
let videoConfig = {};
let labelElement = null;
let routePathInitialized = false;

// Initialize renderer when Mapbox GL is loaded
function initRenderer() {
  console.log('Initializing renderer...');
  
  if (typeof mapboxgl === 'undefined') {
    console.error('Mapbox GL JS is not loaded!');
    return;
  }
  
  // Get Mapbox token from window (should be set by server injection)
  const mapboxToken = window.mapboxToken || '';
  
  if (!mapboxToken) {
    console.error('❌ Mapbox token not found!');
    console.error('Please set MAPBOX_TOKEN in .env file and restart the server');
    return;
  }
  
  mapboxgl.accessToken = mapboxToken;
  console.log('✓ Using Mapbox token');
  
  // Get style from videoConfig if available, otherwise default to dark
  const isDark = (videoConfig && videoConfig.map_style === 'dark') || 
                 (window.routeData && window.routeData.video && window.routeData.video.map_style === 'dark') ||
                 true; // default to dark
  
  // Use Mapbox style (much better quality and performance)
  const mapStyle = isDark 
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11';
  
  console.log(`Using Mapbox style: ${isDark ? 'dark-v11' : 'light-v11'}`);
  
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    console.error('Map container not found!');
    return;
  }
  
  console.log('Creating map with container:', mapContainer);
  console.log('Container dimensions:', mapContainer.offsetWidth, 'x', mapContainer.offsetHeight);
  
  map = new mapboxgl.Map({
    container: 'map',
    style: mapStyle,
    center: [0, 0],
    zoom: 1,
    pitch: 60,
    bearing: 0,
    interactive: true,
    antialias: true,
    preserveDrawingBuffer: true
  });
  
  // Ensure container has proper size
  setTimeout(() => {
    if (map) {
      map.resize();
      console.log('Map resized after creation');
    }
  }, 100);
  
  map.on('load', () => {
    console.log('✓ Map loaded successfully');
    // Ensure map is visible
    if (map) {
      map.resize(); // Resize to ensure proper rendering
      map.triggerRepaint();
      console.log('✓ Map repainted and resized');
      
      // Wait a bit more for tiles to start loading
      setTimeout(() => {
        if (map && map.isStyleLoaded() && map.loaded()) {
          map.triggerRepaint();
          console.log('✓ Map force repainted');
          
          // If we have route data, render it
          if (window.routeData && geocoded.length > 0) {
            render(0);
            console.log('✓ Initial route rendered');
          }
        }
      }, 500);
    }
    window.rendererReady = true;
    console.log('✓ Renderer ready');
    if (window.onRendererReady) {
      window.onRendererReady();
    }
  });
  
  // Also listen for style load
  map.on('style.load', () => {
    console.log('✓ Map style loaded');
    if (map && geocoded.length > 0) {
      setTimeout(() => {
        render(currentTime);
      }, 100);
    }
  });
  
  map.on('error', (e) => {
    console.error('Map error:', e);
    if (e.error && e.error.message) {
      console.error('Error message:', e.error.message);
    }
  });
  
  map.on('styledata', () => {
    console.log('Map style loaded');
  });
  
  map.on('sourcedata', (e) => {
    if (e.isSourceLoaded && e.sourceId === 'osm') {
      console.log('OSM source loaded');
    }
    if (e.sourceId === 'osm' && e.tile) {
      if (e.tile.state === 'loaded') {
        console.log('OSM tile loaded:', e.tile.tileID);
      } else if (e.tile.state === 'errored') {
        console.warn('OSM tile error:', e.tile.tileID);
      }
    }
  });
  
  // Check if map is actually rendering
  map.on('render', () => {
    if (!window.mapRendered) {
      window.mapRendered = true;
      console.log('Map is rendering');
    }
  });
  
  labelElement = document.getElementById('city-label');
  
  window.map = map;
}

// Geocode a city using Nominatim
async function geocodeCity(city, country, language = 'ru') {
  const query = encodeURIComponent(`${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=${language}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'travelvid/1.0.0'
      }
    });
    const data = await response.json();
    
    if (!data || data.length === 0) {
      throw new Error(`No results for ${city}, ${country}`);
    }
    
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name
    };
  } catch (error) {
    console.error(`Geocoding error for ${city}, ${country}:`, error);
    throw error;
  }
}

// Calculate path between two points
// For planes: great circle (shortest path on sphere)
// For trains/cars: simple linear interpolation (surface path)
function calculatePath(start, end, transport, numPoints = 100) {
  const points = [];
  
  if (transport === 'plane') {
    // Great circle for planes
    const startLat = start.lat * Math.PI / 180;
    const startLon = start.lon * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLon = end.lon * Math.PI / 180;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = Math.asin(
        Math.sin(startLat) * Math.cos(t) +
        Math.cos(startLat) * Math.sin(t) * Math.cos(endLon - startLon)
      );
      const lon = startLon + Math.atan2(
        Math.sin(t) * Math.sin(endLon - startLon) * Math.cos(startLat),
        Math.cos(t) - Math.sin(startLat) * Math.sin(lat)
      );
      
      points.push([lon * 180 / Math.PI, lat * 180 / Math.PI]);
    }
  } else {
    // Simple linear interpolation for trains and cars (surface path)
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lon = start.lon + (end.lon - start.lon) * t;
      points.push([lon, lat]);
    }
  }
  
  return points;
}

// Calculate distance between two points
function getDistance(start, end) {
  const R = 6371; // Earth radius in km
  const dLat = (end.lat - start.lat) * Math.PI / 180;
  const dLon = (end.lon - start.lon) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate timeline
function calculateTimeline(data) {
  const config = {
    hold_sec: 0.8,
    t_min: 1.2,
    t_max: 12.0
  };
  
  const duration = data.video.duration_sec;
  const holdSec = data.video.hold_sec || config.hold_sec;
  const numPoints = data.route.length;
  const numSegments = numPoints - 1;
  
  const totalHoldTime = holdSec * numPoints;
  let totalMoveTime = duration - totalHoldTime;
  
  if (totalMoveTime <= 0) {
    totalMoveTime = duration * 0.7; // Fallback
  }
  
  // Calculate distances
  const distances = [];
  let totalDistance = 0;
  
  for (let i = 0; i < numSegments; i++) {
    const from = geocoded[i];
    const to = geocoded[i + 1];
    const dist = getDistance(from, to);
    distances.push(dist);
    totalDistance += dist;
  }
  
  // Calculate segment times
  const segmentTimes = distances.map(dist => {
    return (dist / totalDistance) * totalMoveTime;
  });
  
  // Build timeline
  const timeline = [];
  let currentTime = 0;
  
  // Start point
  timeline.push({
    type: 'start',
    time: currentTime,
    pointIndex: 0
  });
  
  currentTime += holdSec;
  
  // Segments
  for (let i = 0; i < numSegments; i++) {
    const transport = data.route[i + 1].transport;
    const segmentTime = segmentTimes[i];
    
    timeline.push({
      type: 'move',
      time: currentTime,
      segmentIndex: i,
      fromIndex: i,
      toIndex: i + 1,
      transport: transport,
      duration: segmentTime
    });
    
    const labelShowTime = currentTime + segmentTime - 0.3;
    
    timeline.push({
      type: 'showLabel',
      time: labelShowTime,
      pointIndex: i + 1
    });
    
    currentTime += segmentTime;
    
    timeline.push({
      type: 'arrive',
      time: currentTime,
      pointIndex: i + 1
    });
    
    const labelHideTime = currentTime + holdSec - 0.25;
    
    timeline.push({
      type: 'hideLabel',
      time: labelHideTime,
      pointIndex: i + 1
    });
    
    currentTime += holdSec;
  }
  
  timeline.sort((a, b) => a.time - b.time);
  return timeline;
}

// Get current state at time
function getCurrentState(time) {
  let activeSegment = null;
  let activeLabel = null;
  
  for (const event of timeline) {
    if (event.time > time) break;
    
    if (event.type === 'move') {
      activeSegment = event;
    } else if (event.type === 'showLabel') {
      activeLabel = event;
    } else if (event.type === 'hideLabel') {
      if (activeLabel && activeLabel.pointIndex === event.pointIndex) {
        activeLabel = null;
      }
    }
  }
  
  return { segment: activeSegment, label: activeLabel };
}

// Get position on segment
function getPositionOnSegment(segment, time) {
  if (!segment) return null;
  
  const segmentStartTime = segment.time;
  const segmentEndTime = segmentStartTime + segment.duration;
  
  if (time < segmentStartTime || time > segmentEndTime) {
    return null;
  }
  
  const progress = (time - segmentStartTime) / segment.duration;
  const easedProgress = progress < 0.5 
    ? 4 * progress * progress * progress 
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  
  const start = geocoded[segment.fromIndex];
  const end = geocoded[segment.toIndex];
  const transport = segment.transport;
  
  // Use appropriate path calculation based on transport type
  if (transport === 'plane') {
    // Great circle for planes
    const startLat = start.lat * Math.PI / 180;
    const startLon = start.lon * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLon = end.lon * Math.PI / 180;
    
    const t = easedProgress;
    const lat = Math.asin(
      Math.sin(startLat) * Math.cos(t) +
      Math.cos(startLat) * Math.sin(t) * Math.cos(endLon - startLon)
    );
    const lon = startLon + Math.atan2(
      Math.sin(t) * Math.sin(endLon - startLon) * Math.cos(startLat),
      Math.cos(t) - Math.sin(startLat) * Math.sin(lat)
    );
    
    return {
      lat: lat * 180 / Math.PI,
      lon: lon * 180 / Math.PI
    };
  } else {
    // Simple linear interpolation for trains and cars
    const t = easedProgress;
    return {
      lat: start.lat + (end.lat - start.lat) * t,
      lon: start.lon + (end.lon - start.lon) * t
    };
  }
}

// Update camera
function updateCamera(position, segment) {
  if (!position || !segment || !map) return;
  
  const followLat = position.lat;
  const followLon = position.lon;
  
  const start = geocoded[segment.fromIndex];
  const end = geocoded[segment.toIndex];
  const distance = getDistance(start, end);
  const zoom = Math.max(2, Math.min(5, 4 - distance * 0.3));
  
  // Ensure coordinates are valid numbers
  if (isNaN(followLon) || isNaN(followLat)) {
    console.warn('Invalid camera position:', { lon: followLon, lat: followLat });
    return;
  }
  
  map.jumpTo({
    center: [followLon, followLat],
    zoom: zoom,
    pitch: 60,
    bearing: 0
  });
}

// Update label
function updateLabel(label) {
  if (!labelElement || !map) return;
  
  if (!label) {
    labelElement.classList.remove('visible', 'glowing');
    return;
  }
  
  const point = geocoded[label.pointIndex];
  const routePoint = route[label.pointIndex];
  
  // map.project returns a Point object with x and y properties, not an array
  const projected = map.project([point.lon, point.lat]);
  
  labelElement.textContent = `${routePoint.city}, ${routePoint.country}`;
  labelElement.style.left = `${projected.x}px`;
  labelElement.style.top = `${projected.y}px`;
  labelElement.classList.add('visible', 'glowing');
  
  setTimeout(() => {
    labelElement.classList.remove('glowing');
  }, 200);
}

// Render frame
function render(time) {
  currentTime = time;
  
  if (!map) {
    return;
  }
  
  // Wait for style to load
  if (!map.isStyleLoaded()) {
    // Don't log every frame, only occasionally
    if (Math.random() < 0.01) {
      console.log('Waiting for map style to load...');
    }
    return;
  }
  
  // Wait for sources to load
  if (!map.loaded()) {
    return;
  }
  
  const state = getCurrentState(time);
  const position = getPositionOnSegment(state.segment, time);
  
  // Update camera
  if (position && state.segment) {
    updateCamera(position, state.segment);
  } else if (state.label) {
    const point = geocoded[state.label.pointIndex];
    map.jumpTo({
      center: [point.lon, point.lat],
      zoom: 4,
      pitch: 60,
      bearing: 0
    });
  } else if (geocoded.length > 0) {
    // Initial position - center on first city
    const firstCity = geocoded[0];
    map.jumpTo({
      center: [firstCity.lon, firstCity.lat],
      zoom: 2,
      pitch: 60,
      bearing: 0
    });
  }
  
  // Update label
  updateLabel(state.label);
  
  // Initialize complete route path once
  if (!routePathInitialized && geocoded.length > 1) {
    if (!map.isStyleLoaded()) {
      return;
    }
    
    // Build complete route path - all segments
    const allRouteCoordinates = [];
    
    for (let i = 0; i < geocoded.length - 1; i++) {
      const segStart = geocoded[i];
      const segEnd = geocoded[i + 1];
      const transport = route[i + 1].transport;
      const segmentPath = calculatePath(segStart, segEnd, transport);
      
      // Add all points except the last one (to avoid duplicates)
      for (let j = 0; j < segmentPath.length - 1; j++) {
        allRouteCoordinates.push(segmentPath[j]);
      }
    }
    
    // Add last point
    const lastPoint = geocoded[geocoded.length - 1];
    allRouteCoordinates.push([lastPoint.lon, lastPoint.lat]);
    
    // Add route path layer
    try {
      if (map.getSource('route-path')) {
        map.getSource('route-path').setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: allRouteCoordinates
          }
        });
      } else {
        map.addSource('route-path', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: allRouteCoordinates
            }
          }
        });
        
        // Single color for all routes
        const pathColor = 'rgba(100, 150, 255, 0.8)';
        const pathWidth = 3;
        
        map.addLayer({
          id: 'route-path',
          type: 'line',
          source: 'route-path',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': pathColor,
            'line-width': pathWidth
          }
        });
      }
      
      routePathInitialized = true;
    } catch (e) {
      console.warn('Failed to initialize route path:', e);
    }
  }
  
  // Update transport marker position
  if (!map.isStyleLoaded()) {
    return;
  }
  
  // Remove existing transport marker
  try {
    if (map.getLayer('transport-marker')) map.removeLayer('transport-marker');
    if (map.getSource('transport-marker')) map.removeSource('transport-marker');
  } catch (e) {
    // Ignore errors if layers don't exist
  }
  
  // Add transport marker at current position
  if (position && state.segment) {
    const transportSymbol = state.segment.transport === 'plane' ? '✈'
      : state.segment.transport === 'train' ? '🚂' : '🚗';
    
    map.addSource('transport-marker', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [position.lon, position.lat]
        },
        properties: {
          symbol: transportSymbol
        }
      }
    });
    
    map.addLayer({
      id: 'transport-marker',
      type: 'symbol',
      source: 'transport-marker',
      layout: {
        'text-field': transportSymbol,
        'text-size': 24,
        'text-anchor': 'center'
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 2
      }
    });
  }
  
  if (map.isStyleLoaded()) {
    map.triggerRepaint();
  }
}

window.updateTime = function(time) {
  render(time);
};

// Initialize when Mapbox GL loads and token is available
function tryInitRenderer() {
  if (typeof mapboxgl === 'undefined') {
    return false;
  }
  
  // Wait for token to be available
  if (!window.mapboxToken) {
    console.log('Waiting for Mapbox token...');
    return false;
  }
  
  initRenderer();
  return true;
}

// Try to initialize immediately if Mapbox GL is already loaded
if (!tryInitRenderer()) {
  // Wait for page load
  window.addEventListener('load', () => {
    // Try again after a short delay
    setTimeout(() => {
      tryInitRenderer();
    }, 100);
  });
}

// Export function to load route data (with geocoding)
window.loadRouteData = async function(data) {
  videoConfig = data.video || {
    duration_sec: 45,
    fps: 30,
    resolution: '1080x1920',
    map_style: 'dark',
    language: 'ru'
  };
  
  route = data.route || [];
  
  // Geocode all points
  geocoded = [];
  for (let i = 0; i < route.length; i++) {
    const point = route[i];
    try {
      const result = await geocodeCity(point.city, point.country, videoConfig.language);
      geocoded.push(result);
      console.log(`Geocoded ${i + 1}/${route.length}: ${point.city}, ${point.country}`);
    } catch (error) {
      console.error(`Failed to geocode ${point.city}, ${point.country}:`, error);
      throw error;
    }
  }
  
  // Calculate timeline
  timeline = calculateTimeline(data);
  
  // Initial render
  render(0);
  
  return {
    geocoded,
    timeline,
    totalDuration: videoConfig.duration_sec
  };
};

// Export function to load pre-geocoded route data (from server)
window.loadPreparedRouteData = function(routeData) {
  videoConfig = routeData.video || {
    duration_sec: 45,
    fps: 30,
    resolution: '1080x1920',
    map_style: 'dark',
    language: 'ru'
  };
  
  route = routeData.route || [];
  geocoded = routeData.geocoded || [];
  timeline = routeData.timeline || [];
  
  // Token should already be set by server injection, but update if provided and different
  if (routeData.mapboxToken && routeData.mapboxToken !== window.mapboxToken) {
    window.mapboxToken = routeData.mapboxToken;
    mapboxgl.accessToken = routeData.mapboxToken;
    console.log('✓ Mapbox token updated from route data');
  }
  
  // Reset route path initialization flag when loading new route data
  routePathInitialized = false;
  
  // If map is already initialized, check if style needs updating
  if (map && window.mapboxToken) {
    mapboxgl.accessToken = window.mapboxToken;
    const isDark = videoConfig.map_style === 'dark';
    const newStyle = isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
    const currentStyle = map.getStyle();
    const currentStyleUrl = currentStyle && currentStyle.sources ? 
      (currentStyle.metadata && currentStyle.metadata['mapbox:autocomposite'] ? 'mapbox://styles/mapbox/dark-v11' : 
       currentStyle.name === 'Dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11') : null;
    
    // Only update style if it's different
    if (currentStyleUrl !== newStyle && map.isStyleLoaded()) {
      console.log('Updating map style from', currentStyleUrl, 'to', newStyle);
      map.setStyle(newStyle);
      // Wait for style to load before rendering
      map.once('style.load', () => {
        console.log('Map style updated to:', isDark ? 'dark-v11' : 'light-v11');
        routePathInitialized = false; // Reset to reinitialize route path
        render(0);
      });
      return {
        geocoded,
        timeline,
        totalDuration: routeData.totalDuration
      };
    }
  }
  
  console.log('✓ Route data loaded:', {
    routeLength: route.length,
    geocodedLength: geocoded.length,
    timelineLength: timeline.length,
    totalDuration: routeData.totalDuration
  });
  
  // Log first city coordinates for debugging
  if (geocoded.length > 0) {
    console.log('✓ First city:', {
      city: route[0].city,
      country: route[0].country,
      lat: geocoded[0].lat,
      lon: geocoded[0].lon
    });
  }
  
  // Initial render - wait a bit if map is not ready
  if (map && map.isStyleLoaded()) {
    console.log('Map ready, rendering initial frame');
    render(0);
  } else if (map) {
    console.log('Waiting for map to load before rendering');
    map.once('load', () => {
      console.log('Map loaded, rendering initial frame');
      render(0);
    });
  } else {
    console.log('Map not initialized yet, will render when ready');
    // Map not initialized yet, will render when ready
    const checkMap = setInterval(() => {
      if (map && map.isStyleLoaded()) {
        clearInterval(checkMap);
        console.log('Map ready, rendering initial frame');
        render(0);
      }
    }, 100);
    
    // Stop checking after 5 seconds
    setTimeout(() => clearInterval(checkMap), 5000);
  }
  
  return {
    geocoded,
    timeline,
    totalDuration: routeData.totalDuration
  };
};
