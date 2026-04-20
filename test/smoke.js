import { strict as assert } from 'assert';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

console.log('Scout Tester — Smoke Tests\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

// ─── Files & Packaging ───

test('server.js exists', () => {
  assert.ok(existsSync(join(ROOT, 'server.js')));
});

test('index.html exists', () => {
  assert.ok(existsSync(join(ROOT, 'index.html')));
});

test('web assets exist', () => {
  assert.ok(existsSync(join(ROOT, 'web', 'styles.css')));
  assert.ok(existsSync(join(ROOT, 'web', 'app.js')));
});

test('package.json has type: module', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
});

test('package.json has start script', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts?.start);
});

test('package.json main points to src/index.js', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.main, 'src/index.js');
});

test('package.json exports map covers all modules', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  for (const key of ['.', './config', './errors', './logger', './countries', './probe', './results', './runs', './runner', './state']) {
    assert.ok(pkg.exports[key], `missing export ${key}`);
  }
});

test('.gitignore exists', () => {
  assert.ok(existsSync(join(ROOT, '.gitignore')));
});

test('data directory exists', () => {
  assert.ok(existsSync(join(ROOT, 'data')));
});

// ─── Server Entry Point ───

test('server.js uses ESM imports', () => {
  const src = readFileSync(join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('import express'));
  assert.ok(!src.includes('require('));
});

test('server.js has health endpoint', () => {
  const src = readFileSync(join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('/health'));
});

test('server.js has graceful shutdown', () => {
  const src = readFileSync(join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('SIGINT'));
  assert.ok(src.includes('SIGTERM'));
});

test('server.js has section dividers', () => {
  const src = readFileSync(join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('// ─── '));
});

// ─── src/ Layout ───

test('src/ modules exist', () => {
  for (const sub of ['config', 'errors', 'logger', 'countries', 'probe', 'results', 'runs', 'runner', 'state']) {
    assert.ok(existsSync(join(ROOT, 'src', sub, 'index.js')), `missing src/${sub}/index.js`);
  }
});

test('src/index.js barrel exports', () => {
  assert.ok(existsSync(join(ROOT, 'src', 'index.js')));
});

test('src/runner split into settings and pipeline', () => {
  assert.ok(existsSync(join(ROOT, 'src', 'runner', 'settings.js')));
  assert.ok(existsSync(join(ROOT, 'src', 'runner', 'pipeline.js')));
});

test('src/errors exports ScoutError class', () => {
  const src = readFileSync(join(ROOT, 'src', 'errors', 'index.js'), 'utf8');
  assert.ok(src.includes('export class ScoutError'));
  assert.ok(src.includes('ErrorCodes'));
});

test('src/logger exports logger + setLogLevel', () => {
  const src = readFileSync(join(ROOT, 'src', 'logger', 'index.js'), 'utf8');
  assert.ok(src.includes('export const logger'));
  assert.ok(src.includes('setLogLevel'));
});

test('src/results has no hardcoded API key', () => {
  const src = readFileSync(join(ROOT, 'src', 'results', 'index.js'), 'utf8');
  assert.ok(src.includes('process.env.SCOUT_KEY'));
  assert.ok(!src.includes('scout-c1_'));
});

// ─── server/ Layout ───

test('server/ routes exist', () => {
  for (const name of ['results', 'countries', 'settings', 'account', 'runs', 'control', 'index']) {
    assert.ok(existsSync(join(ROOT, 'server', 'routes', `${name}.js`)), `missing server/routes/${name}.js`);
  }
});

test('server/sse.js exists', () => {
  assert.ok(existsSync(join(ROOT, 'server', 'sse.js')));
});

// ─── Legacy Removed ───

test('core/ directory removed', () => {
  assert.ok(!existsSync(join(ROOT, 'core')));
});

test('root index.js removed', () => {
  assert.ok(!existsSync(join(ROOT, 'index.js')));
});

// ─── CHANGELOG ───

test('CHANGELOG.md documents 2.2.0', () => {
  const src = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(src.includes('2.2.0'));
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
