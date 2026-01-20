const fs = require('fs');
const path = require('path');
const { parseInput } = require('./input-parser');
const { Geocoder } = require('./geocoder');
const { calculateTimeline } = require('./timeline');
const { FrameCapturer } = require('./frame-capturer');
const { VideoEncoder } = require('./video-encoder');
const config = require('../config.json').defaults;

async function generateVideo(options) {
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.out);
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('Step 1: Reading input file...');
  const data = await parseInput(inputPath);
  
  // Override video settings from CLI
  if (options.duration) {
    data.video.duration_sec = parseFloat(options.duration);
  }
  if (options.fps) {
    data.video.fps = parseInt(options.fps, 10);
  }
  
  // Apply defaults
  data.video.fps = data.video.fps || config.fps;
  data.video.resolution = data.video.resolution || config.resolution;
  data.video.map_style = data.video.map_style || config.map_style;
  data.video.language = data.video.language || config.language;
  data.video.hold_sec = data.video.hold_sec || config.hold_sec;
  
  console.log(`Step 2: Geocoding ${data.route.length} locations...`);
  const geocoder = new Geocoder();
  const language = data.video.language;
  
  data.geocoded = [];
  for (let i = 0; i < data.route.length; i++) {
    const point = data.route[i];
    console.log(`  [${i + 1}/${data.route.length}] ${point.city}, ${point.country}`);
    
    try {
      const result = await geocoder.geocode(point.city, point.country, language);
      data.geocoded.push(result);
      console.log(`    ✓ ${result.display_name} (${result.lat}, ${result.lon})`);
    } catch (error) {
      throw new Error(`Geocode failed for ${point.city}, ${point.country} at route[${i}]. ${error.message}`);
    }
  }
  
  console.log('Step 3: Calculating timeline...');
  const timelineData = calculateTimeline(data);
  console.log(`  Total duration: ${timelineData.totalDuration.toFixed(2)}s`);
  console.log(`  Segments: ${timelineData.segmentTimes.length}`);
  
  const outputDirFrames = path.join(__dirname, '..', 'output', 'frames');
  if (!fs.existsSync(outputDirFrames)) {
    fs.mkdirSync(outputDirFrames, { recursive: true });
  }
  
  console.log('Step 4: Rendering frames...');
  const capturer = new FrameCapturer();
  const totalFrames = Math.ceil(data.video.duration_sec * data.video.fps);
  
  await capturer.captureFrames({
    data,
    timeline: timelineData.timeline,
    totalFrames,
    fps: data.video.fps,
    resolution: data.video.resolution,
    outputDir: outputDirFrames,
    showBrowser: options.showBrowser || false
  });
  
  console.log(`Step 5: Encoding video (${totalFrames} frames)...`);
  const encoder = new VideoEncoder();
  await encoder.encode({
    framesDir: outputDirFrames,
    outputPath,
    fps: data.video.fps,
    resolution: data.video.resolution
  });
  
  if (!options.keepFrames) {
    console.log('Step 6: Cleaning up frames...');
    const frames = fs.readdirSync(outputDirFrames);
    for (const frame of frames) {
      fs.unlinkSync(path.join(outputDirFrames, frame));
    }
    fs.rmdirSync(outputDirFrames);
  }
  
  console.log(`\n✓ Video generated successfully: ${outputPath}`);
}

module.exports = { generateVideo };

