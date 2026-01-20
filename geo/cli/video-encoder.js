const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

class VideoEncoder {
  async encode(options) {
    const { framesDir, outputPath, fps, resolution } = options;
    
    // Check if ffmpeg is available
    try {
      await execAsync('ffmpeg -version');
    } catch (error) {
      throw new Error('ffmpeg is not installed or not in PATH. Please install ffmpeg first.');
    }
    
    const [width, height] = resolution.split('x').map(Number);
    const framesPattern = path.join(framesDir, 'frame_%06d.png');
    
    // FFmpeg command for H.264 encoding
    const command = [
      'ffmpeg',
      '-y', // Overwrite output file
      '-r', fps.toString(), // Input frame rate
      '-i', framesPattern, // Input pattern
      '-c:v', 'libx264', // Video codec
      '-pix_fmt', 'yuv420p', // Pixel format for compatibility
      '-crf', '23', // Quality (lower = better, 18-28 is reasonable)
      '-preset', 'medium', // Encoding speed
      '-r', fps.toString(), // Output frame rate
      '-s', `${width}x${height}`, // Resolution
      outputPath
    ].join(' ');
    
    console.log('  Running ffmpeg...');
    
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        // FFmpeg writes progress to stderr, which is normal
        console.log('  Encoding complete');
      }
    } catch (error) {
      throw new Error(`FFmpeg encoding failed: ${error.message}`);
    }
  }
}

module.exports = { VideoEncoder };

