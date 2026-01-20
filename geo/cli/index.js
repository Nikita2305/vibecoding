#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');

program
  .name('travelvid')
  .description('Travel route animation web server')
  .version('1.0.0');

program
  .command('serve')
  .description('Start web server with route animation')
  .requiredOption('--input <file>', 'Input JSON file with route')
  .option('--port <port>', 'Server port', '8000')
  .action(async (options) => {
    const { startServer } = require('./serve');
    await startServer(options);
  });

program.parse();

