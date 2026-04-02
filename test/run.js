#!/usr/bin/env node
/**
 * Run all tests via Node's built-in test runner.
 * Usage: node test/run.js
 *   or:  node --test test/*.test.js
 */
const { run } = require('node:test');
const path = require('path');

const files = ['api.test.js', 'format.test.js', 'seen.test.js'].map(f => path.join(__dirname, f));

run({ files, concurrency: 1 })
  .on('test:fail', (e) => {
    console.error(`\nFAIL: ${e.file} — ${e.name}`);
    console.error(`  ${e.err?.message}`);
    process.exitCode = 1;
  })
  .on('test:pass', () => { process.stdout.write('.'); })
  .on('done', () => {
    console.log(`\nDone (exit ${process.exitCode ?? 0})`);
  });
