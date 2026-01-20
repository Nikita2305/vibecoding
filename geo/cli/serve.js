#!/usr/bin/env node

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseInput } = require('./input-parser');
const { Geocoder } = require('./geocoder');
const { calculateTimeline } = require('./timeline');

async function startServer(options) {
    try {
      // Check for Mapbox token
      const mapboxToken = process.env.MAPBOX_TOKEN;
      if (!mapboxToken) {
        throw new Error(
          'MAPBOX_TOKEN is required!\n' +
          'Please add MAPBOX_TOKEN to your .env file.\n' +
          'Get a free token at: https://account.mapbox.com/'
        );
      }
      
      console.log('✓ Mapbox token found');
      
      const inputPath = path.resolve(options.input);
      
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      console.log(`Reading route file: ${inputPath}`);
      const data = await parseInput(inputPath);
      
      // Apply defaults
      const config = require('../config.json').defaults;
      data.video.fps = data.video.fps || config.fps;
      data.video.resolution = data.video.resolution || config.resolution;
      data.video.map_style = data.video.map_style || config.map_style;
      data.video.language = data.video.language || config.language;
      data.video.hold_sec = data.video.hold_sec || config.hold_sec;
      
      console.log(`Geocoding ${data.route.length} locations...`);
      const geocoder = new Geocoder();
      const language = data.video.language;
      
      const geocoded = [];
      for (let i = 0; i < data.route.length; i++) {
        const point = data.route[i];
        console.log(`  [${i + 1}/${data.route.length}] ${point.city}, ${point.country}`);
        
        try {
          const result = await geocoder.geocode(point.city, point.country, language);
          geocoded.push(result);
          console.log(`    ✓ ${result.display_name} (${result.lat}, ${result.lon})`);
        } catch (error) {
          throw new Error(`Geocode failed for ${point.city}, ${point.country} at route[${i}]. ${error.message}`);
        }
      }
      
      // Calculate timeline
      data.geocoded = geocoded;
      const timelineData = calculateTimeline(data);
      
      // Prepare route data for frontend
      const routeData = {
        route: data.route,
        video: data.video,
        geocoded: geocoded,
        timeline: timelineData.timeline,
        totalDuration: timelineData.totalDuration,
        mapboxToken: mapboxToken
      };
      
      const port = parseInt(options.port, 10);
      const projectRoot = path.join(__dirname, '..');
      
      const server = http.createServer((req, res) => {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        
        // Handle favicon.ico
        if (filePath === '/favicon.ico') {
          res.writeHead(204);
          res.end();
          return;
        }
        
        // Serve route data as JSON
        if (filePath === '/route-data.json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(routeData));
          return;
        }
        
        // Remove query string
        filePath = filePath.split('?')[0];
        
        // Security: prevent directory traversal
        if (filePath.includes('..')) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        
        const fullPath = path.join(projectRoot, filePath);
        
        // Check if file exists
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml'
        }[ext] || 'text/plain';
        
        let content = fs.readFileSync(fullPath);
        
        // Set headers with CSP for HTML files
        const headers = { 'Content-Type': contentType };
        if (ext === '.html') {
          // More permissive CSP for Mapbox GL JS which requires eval and workers
          headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-eval' 'unsafe-inline' https: data: blob:; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://api.mapbox.com https://*.mapbox.com blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://api.mapbox.com https://*.mapbox.com; font-src 'self' data: https://*.mapbox.com https://demotiles.mapbox.com blob:; img-src 'self' data: blob: https:; connect-src 'self' https://api.mapbox.com https://*.mapbox.com https://*.openstreetmap.org https://nominatim.openstreetmap.org;";
          
          // Inject Mapbox token into HTML
          if (filePath === '/index.html') {
            content = content.toString();
            // Insert token right after Mapbox GL script loads
            const tokenScript = `
    <script>
      // Mapbox token injected by server
      window.mapboxToken = '${mapboxToken}';
      if (typeof mapboxgl !== 'undefined') {
        mapboxgl.accessToken = '${mapboxToken}';
      }
      console.log('✓ Mapbox token injected');
    </script>`;
            // Insert after mapbox-gl.js script tag
            content = content.replace(
              /(<script src="https:\/\/api\.mapbox\.com\/mapbox-gl-js\/[^"]+"><\/script>)/,
              `$1${tokenScript}`
            );
            content = Buffer.from(content);
          }
        }
        
        res.writeHead(200, headers);
        res.end(content);
      });
      
      server.listen(port, () => {
        console.log(`\n✓ Server started at http://localhost:${port}`);
        console.log(`  Route: ${data.route.length} cities`);
        console.log(`  Duration: ${data.video.duration_sec}s`);
        console.log(`\n  Open http://localhost:${port} in your browser`);
        console.log(`  Press Ctrl+C to stop\n`);
      });
      
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
}

// If run directly
if (require.main === module) {
  const { program } = require('commander');
  
  program
    .name('travelvid-serve')
    .description('Start web server for travel route animation')
    .requiredOption('--input <file>', 'Input JSON file with route')
    .option('--port <port>', 'Server port', '8000')
    .action(startServer);
  
  program.parse();
} else {
  module.exports = { startServer };
}

