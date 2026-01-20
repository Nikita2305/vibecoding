const { getDistance } = require('geolib');

function calculateTimeline(data) {
  const config = require('../config.json').defaults;
  const video = data.video;
  
  const duration = video.duration_sec;
  const holdSec = video.hold_sec || config.hold_sec;
  const tMin = config.t_min;
  const tMax = config.t_max;
  
  const numPoints = data.route.length;
  const numSegments = numPoints - 1;
  
  // Calculate total hold time (hold at each arrival, including start)
  const totalHoldTime = holdSec * numPoints;
  
  // Calculate available movement time
  let totalMoveTime = duration - totalHoldTime;
  
  if (totalMoveTime <= 0) {
    const maxHoldSec = duration / numPoints;
    throw new Error(
      `Duration too short; increase duration_sec (current: ${duration}s) or decrease hold_sec ` +
      `(current: ${holdSec}s, max: ${maxHoldSec.toFixed(2)}s)`
    );
  }
  
  // Calculate distances for each segment
  const distances = [];
  let totalDistance = 0;
  
  for (let i = 0; i < numSegments; i++) {
    const from = data.geocoded[i];
    const to = data.geocoded[i + 1];
    const dist = getDistance(
      { latitude: from.lat, longitude: from.lon },
      { latitude: to.lat, longitude: to.lon }
    ) / 1000; // Convert to km
    distances.push(dist);
    totalDistance += dist;
  }
  
  // Calculate time per segment (proportional to distance)
  const segmentTimes = distances.map(dist => {
    return (dist / totalDistance) * totalMoveTime;
  });
  
  // Apply min/max constraints
  let adjustedTimes = [...segmentTimes];
  let remainingTime = totalMoveTime;
  
  // First pass: apply minimum constraint
  for (let i = 0; i < adjustedTimes.length; i++) {
    if (adjustedTimes[i] < tMin) {
      remainingTime -= tMin;
      adjustedTimes[i] = tMin;
    } else {
      remainingTime -= adjustedTimes[i];
    }
  }
  
  // Redistribute remaining time proportionally
  if (remainingTime > 0) {
    const validSegments = adjustedTimes.map((t, i) => 
      segmentTimes[i] >= tMin ? segmentTimes[i] : 0
    );
    const validTotal = validSegments.reduce((a, b) => a + b, 0);
    
    if (validTotal > 0) {
      for (let i = 0; i < adjustedTimes.length; i++) {
        if (validSegments[i] > 0) {
          adjustedTimes[i] += (validSegments[i] / validTotal) * remainingTime;
        }
      }
    }
  }
  
  // Apply max constraint
  for (let i = 0; i < adjustedTimes.length; i++) {
    if (adjustedTimes[i] > tMax) {
      adjustedTimes[i] = tMax;
    }
  }
  
  // Build timeline
  const timeline = [];
  let currentTime = 0;
  
  // Start point
  timeline.push({
    type: 'start',
    time: currentTime,
    pointIndex: 0,
    lat: data.geocoded[0].lat,
    lon: data.geocoded[0].lon,
    city: data.route[0].city,
    country: data.route[0].country
  });
  
  currentTime += holdSec;
  
  // Segments
  for (let i = 0; i < numSegments; i++) {
    const transport = data.route[i + 1].transport;
    const segmentTime = adjustedTimes[i];
    
    // Show label before segment ends
    const labelShowTime = currentTime + segmentTime - (config.label_show_sec || 0.3);
    
    timeline.push({
      type: 'move',
      time: currentTime,
      segmentIndex: i,
      fromIndex: i,
      toIndex: i + 1,
      transport: transport,
      duration: segmentTime,
      fromLat: data.geocoded[i].lat,
      fromLon: data.geocoded[i].lon,
      toLat: data.geocoded[i + 1].lat,
      toLon: data.geocoded[i + 1].lon
    });
    
    timeline.push({
      type: 'showLabel',
      time: labelShowTime,
      pointIndex: i + 1,
      lat: data.geocoded[i + 1].lat,
      lon: data.geocoded[i + 1].lon,
      city: data.route[i + 1].city,
      country: data.route[i + 1].country
    });
    
    currentTime += segmentTime;
    
    timeline.push({
      type: 'arrive',
      time: currentTime,
      pointIndex: i + 1,
      lat: data.geocoded[i + 1].lat,
      lon: data.geocoded[i + 1].lon,
      city: data.route[i + 1].city,
      country: data.route[i + 1].country
    });
    
    // Hide label before next segment starts
    const labelHideTime = currentTime + holdSec - (config.label_hide_sec || 0.25);
    
    timeline.push({
      type: 'hideLabel',
      time: labelHideTime,
      pointIndex: i + 1
    });
    
    currentTime += holdSec;
  }
  
  // Sort timeline by time
  timeline.sort((a, b) => a.time - b.time);
  
  return {
    timeline,
    totalDuration: currentTime,
    segmentTimes: adjustedTimes
  };
}

module.exports = { calculateTimeline };

