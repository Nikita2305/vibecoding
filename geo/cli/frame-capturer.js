const puppeteer = require('puppeteer');
const path = require('path');
const express = require('express');
const http = require('http');

class FrameCapturer {
  constructor() {
    this.server = null;
    this.port = 0;
  }

  async startServer() {
    const app = express();
    app.use(express.static(path.join(__dirname, '..', 'app')));
    
    return new Promise((resolve) => {
      this.server = http.createServer(app);
      this.server.listen(0, () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  async stopServer() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => resolve());
      });
    }
  }

  async captureFrames(options) {
    await this.startServer();
    
    // Try to use system Chrome if Puppeteer's Chrome is not available
    let launchOptions = {
      headless: !options.showBrowser, // Show browser if requested
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (options.showBrowser) {
      console.log('  Browser window will be visible (--show-browser mode)');
    }
    
    // Check if we can use system Chrome (common paths on macOS)
    const { execSync } = require('child_process');
    let executablePath = null;
    
    try {
      // Try to find Chrome/Chromium
      const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        process.env.CHROME_PATH
      ].filter(Boolean);
      
      for (const chromePath of possiblePaths) {
        try {
          execSync(`test -f "${chromePath}"`, { stdio: 'ignore' });
          executablePath = chromePath;
          break;
        } catch (e) {
          // Path doesn't exist, try next
        }
      }
    } catch (e) {
      // Ignore errors, will try default Puppeteer Chrome
    }
    
    if (executablePath) {
      launchOptions.executablePath = executablePath;
      console.log(`  Using system Chrome: ${executablePath}`);
    }
    
    let browser;
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (error) {
      if (!executablePath) {
        throw new Error(
          'Failed to launch browser. Please install Chrome/Chromium or set CHROME_PATH environment variable.\n' +
          'On macOS: brew install --cask google-chrome\n' +
          'Or set: export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
        );
      }
      throw error;
    }
    
    try {
      console.log('  Creating new page...');
      const page = await browser.newPage();
      
      // Enable console logging from page
      page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') {
          console.error(`  [Page Error] ${text}`);
        } else if (type === 'warning') {
          console.warn(`  [Page Warning] ${text}`);
        } else {
          console.log(`  [Page] ${text}`);
        }
      });
      
      page.on('pageerror', error => {
        console.error(`  [Page Exception] ${error.message}`);
      });
      
      const [width, height] = options.resolution.split('x').map(Number);
      console.log(`  Setting viewport: ${width}x${height}`);
      await page.setViewport({ width, height });
      
      const url = `http://localhost:${this.port}/index.html`;
      console.log(`  Loading page: ${url}`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('  Page DOM loaded');
        // Wait a bit for external resources using evaluate
        await page.evaluate(() => {
          return new Promise(resolve => setTimeout(resolve, 2000));
        });
        console.log('  Waiting for resources complete');
      } catch (error) {
        console.error(`  Error loading page: ${error.message}`);
        throw error;
      }
      
      // Pass data to the page BEFORE waiting for renderer
      console.log('  Passing data to page...');
      await page.evaluate((data) => {
        window.renderData = data;
        console.log('Data passed to page, timeline length:', data.timeline ? data.timeline.length : 0);
      }, {
        timeline: options.timeline,
        geocoded: options.data.geocoded,
        route: options.data.route,
        video: options.data.video
      });
      
      // Check if renderer is initializing
      console.log('  Waiting for renderer initialization...');
      const rendererStatus = await page.evaluate(() => {
        return {
          hasData: !!window.renderData,
          rendererReady: window.rendererReady === true,
          hasMap: typeof mapboxgl !== 'undefined',
          hasMapInstance: typeof map !== 'undefined'
        };
      });
      console.log('  Renderer status:', rendererStatus);
      
      // Wait for initialization with longer timeout and better error handling
      try {
        await page.waitForFunction(() => window.rendererReady === true, { 
          timeout: 30000,
          polling: 500
        });
        console.log('  Renderer initialized successfully');
      } catch (error) {
        // Get more info about what's wrong
        const debugInfo = await page.evaluate(() => {
          return {
            rendererReady: window.rendererReady,
            hasRenderData: !!window.renderData,
            hasMapboxGL: typeof mapboxgl !== 'undefined',
            hasMap: typeof map !== 'undefined',
            mapLoaded: typeof map !== 'undefined' && map ? map.loaded() : false,
            errors: window.errors || []
          };
        });
        console.error('  Renderer initialization failed. Debug info:', debugInfo);
        throw new Error(`Renderer initialization timeout. Status: ${JSON.stringify(debugInfo)}`);
      }
      
      const totalFrames = options.totalFrames;
      const fps = options.fps;
      
      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps;
        
        // Update time in renderer
        await page.evaluate((t) => {
          if (window.updateTime) {
            window.updateTime(t);
          }
        }, time);
        
        // Wait for render (longer wait for map to update)
        await page.evaluate(() => {
          return new Promise(resolve => setTimeout(resolve, 100));
        });
        
        // Capture frame
        const framePath = path.join(options.outputDir, `frame_${String(frame + 1).padStart(6, '0')}.png`);
        await page.screenshot({
          path: framePath,
          type: 'png'
        });
        
        if ((frame + 1) % 30 === 0) {
          console.log(`  Rendered ${frame + 1}/${totalFrames} frames`);
        }
      }
      
      console.log(`  Rendered ${totalFrames}/${totalFrames} frames`);
    } finally {
      await browser.close();
      await this.stopServer();
    }
  }
}

module.exports = { FrameCapturer };

