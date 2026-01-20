const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_FILE = path.join(__dirname, '..', 'geocode_cache.json');

class Geocoder {
  constructor() {
    this.cache = this.loadCache();
  }

  loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const content = fs.readFileSync(CACHE_FILE, 'utf-8');
        const cache = JSON.parse(content);
        const cacheSize = Object.keys(cache).length;
        console.log(`  Loaded geocode cache: ${cacheSize} entries`);
        return cache;
      } catch (error) {
        console.warn('Failed to load geocode cache:', error.message);
        return {};
      }
    }
    console.log('  No geocode cache found, will create new one');
    return {};
  }

  saveCache() {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to save geocode cache:', error.message);
    }
  }

  getCacheKey(city, country, language) {
    return `${city}|${country}|${language}`;
  }

  async geocode(city, country, language = 'ru') {
    const key = this.getCacheKey(city, country, language);
    
    if (this.cache[key]) {
      console.log(`    [CACHE] Using cached result for ${city}, ${country}`);
      return this.cache[key];
    }

    console.log(`    [API] Fetching from Nominatim for ${city}, ${country}`);
    const result = await this.geocodeNominatim(city, country, language);
    this.cache[key] = result;
    this.saveCache();
    console.log(`    [CACHE] Saved to cache`);
    
    return result;
  }

  async geocodeNominatim(city, country, language) {
    const query = encodeURIComponent(`${city}, ${country}`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=${language}`;
    
    const userAgent = process.env.NOMINATIM_USER_AGENT || 'travelvid/1.0.0';
    
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': userAgent
        }
      };
      
      https.get(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            
            if (!results || results.length === 0) {
              reject(new Error(`No results found for "${city}, ${country}"`));
              return;
            }
            
            const result = results[0];
            resolve({
              lat: parseFloat(result.lat),
              lon: parseFloat(result.lon),
              display_name: result.display_name
            });
          } catch (error) {
            reject(new Error(`Failed to parse geocoding response: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Geocoding request failed: ${error.message}`));
      });
    });
  }
}

module.exports = { Geocoder };

