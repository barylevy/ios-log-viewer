#!/usr/bin/env node

/**
 * Test runner script for LogParser tests
 * Provides easy commands to run different test suites
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

const runCommand = (command, args = []) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
};

const main = async () => {
  const command = process.argv[2];

  console.log('🧪 LogParser Test Runner\n');

  try {
    switch (command) {
      case 'all':
        console.log('Running all LogParser tests...\n');
        await runCommand('npm', ['run', 'test']);
        break;

      case 'basic':
        console.log('Running basic LogParser tests...\n');
        await runCommand('npm', ['run', 'test', 'src/test/logParser.test.js']);
        break;

      case 'comprehensive':
        console.log('Running comprehensive validation tests...\n');
        await runCommand('npm', ['run', 'test', 'src/test/logParser.comprehensive.test.js']);
        break;

      case 'performance':
        console.log('Running performance tests...\n');
        await runCommand('npm', ['run', 'test', 'src/test/logParser.performance.test.js']);
        break;

      case 'watch':
        console.log('Starting test watcher...\n');
        await runCommand('npm', ['run', 'test']);
        break;

      case 'ui':
        console.log('Starting test UI...\n');
        await runCommand('npm', ['run', 'test:ui']);
        break;

      default:
        console.log(`Usage: node run-tests.js <command>

Available commands:
  all            - Run all tests
  basic          - Run basic parsing tests
  comprehensive  - Run comprehensive validation tests  
  performance    - Run performance and stress tests
  watch          - Run tests in watch mode
  ui             - Start interactive test UI

Examples:
  node run-tests.js all
  node run-tests.js comprehensive
  node run-tests.js performance
`);
        break;
    }
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
};

main();