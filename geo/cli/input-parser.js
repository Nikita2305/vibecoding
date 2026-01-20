const fs = require('fs');
const path = require('path');

async function parseInput(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  
  if (ext === '.json') {
    return parseJSON(inputPath);
  } else if (ext === '.csv') {
    return parseCSV(inputPath);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Supported: .json, .csv`);
  }
}

function parseJSON(inputPath) {
  const content = fs.readFileSync(inputPath, 'utf-8');
  
  let data;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON format: ${error.message}`);
  }
  
  validateData(data);
  return data;
}

function parseCSV(inputPath) {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  const header = lines[0].split(',').map(h => h.trim());
  const cityIdx = header.indexOf('city');
  const countryIdx = header.indexOf('country');
  const transportIdx = header.indexOf('transport');
  
  if (cityIdx === -1 || countryIdx === -1) {
    throw new Error('CSV must have "city" and "country" columns');
  }
  
  const route = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const point = {
      city: values[cityIdx],
      country: values[countryIdx]
    };
    
    if (transportIdx !== -1 && values[transportIdx]) {
      point.transport = values[transportIdx];
    }
    
    route.push(point);
  }
  
  return {
    video: {
      duration_sec: 45,
      fps: 30,
      resolution: '1080x1920',
      map_style: 'dark',
      language: 'ru'
    },
    route
  };
}

function validateData(data) {
  if (!data.video) {
    throw new Error('Missing "video" section in input');
  }
  
  if (!data.video.duration_sec) {
    throw new Error('Missing required field: video.duration_sec');
  }
  
  if (!data.route || !Array.isArray(data.route)) {
    throw new Error('Missing or invalid "route" array');
  }
  
  if (data.route.length < 2) {
    throw new Error('Route must contain at least 2 points');
  }
  
  const validTransports = ['plane', 'train', 'car'];
  
  for (let i = 0; i < data.route.length; i++) {
    const point = data.route[i];
    
    if (!point.city || !point.country) {
      throw new Error(`Missing city or country at route[${i}]`);
    }
    
    if (i === 0 && point.transport) {
      throw new Error(`First route point (route[0]) should not have transport`);
    }
    
    if (i > 0 && point.transport && !validTransports.includes(point.transport)) {
      throw new Error(`Unsupported transport "${point.transport}" at route[${i}]. Valid: ${validTransports.join(', ')}`);
    }
  }
}

module.exports = { parseInput };

