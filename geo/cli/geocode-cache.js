const fs = require('fs');
const path = require('path');
const { parseInput } = require('./input-parser');
const { Geocoder } = require('./geocoder');

async function geocodeCache(options) {
  const inputPath = path.resolve(options.input);
  
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  console.log(`Reading input file: ${inputPath}`);
  const data = await parseInput(inputPath);
  
  const geocoder = new Geocoder();
  const language = data.video?.language || 'ru';
  
  console.log(`Geocoding ${data.route.length} locations...`);
  
  for (let i = 0; i < data.route.length; i++) {
    const point = data.route[i];
    const city = point.city;
    const country = point.country;
    
    console.log(`[${i + 1}/${data.route.length}] Geocoding: ${city}, ${country}`);
    
    try {
      const result = await geocoder.geocode(city, country, language);
      console.log(`  ✓ Found: ${result.display_name} (${result.lat}, ${result.lon})`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      throw new Error(`Geocode failed for ${city}, ${country} at route[${i}]. ${error.message}`);
    }
  }
  
  console.log('Geocode cache populated successfully!');
}

module.exports = { geocodeCache };

