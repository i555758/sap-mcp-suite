#!/usr/bin/env node

/**
 * Test script for the GitHub MCP server using the inspector
 */

const { spawn } = require('child_process');
const path = require('path');

// Set environment variables for testing
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || '<YOUR_GITHUB_TOKEN>';
process.env.GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://github.tools.sap/api/v3';
process.env.GITHUB_DEFAULT_OWNER = process.env.GITHUB_DEFAULT_OWNER || 'your_username';

console.log('Starting GitHub MCP Server Inspector...');
console.log('Using SAP GitHub Enterprise at: https://github.tools.sap/');
console.log('Default user: i530424');
console.log('');

// Path to the built server
const serverPath = path.join(__dirname, 'build', 'index.js');

// Spawn the inspector
const inspector = spawn('npx', ['@modelcontextprotocol/inspector', serverPath], {
  stdio: 'inherit',
  env: process.env
});

inspector.on('error', (error) => {
  console.error('Failed to start inspector:', error);
  process.exit(1);
});

inspector.on('close', (code) => {
  console.log(`Inspector exited with code ${code}`);
  process.exit(code);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down inspector...');
  inspector.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\nShutting down inspector...');
  inspector.kill('SIGTERM');
});
