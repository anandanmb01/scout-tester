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

test('server.js exists', () => {
  assert.ok(existsSync(join(ROOT, 'server.js')));
});

test('index.html exists', () => {
  assert.ok(existsSync(join(ROOT, 'index.html')));
});

test('package.json has type: module', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
});

test('package.json has start script', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts?.start);
});

test('.env exists', () => {
  assert.ok(existsSync(join(ROOT, '.env')));
});

test('.gitignore exists', () => {
  assert.ok(existsSync(join(ROOT, '.gitignore')));
});

test('data directory exists', () => {
  assert.ok(existsSync(join(ROOT, 'data')));
});

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
  assert.ok(src.includes('// ─── Routes'));
});

test('core/constants.js has SCOUT_KEY env loading', () => {
  const src = readFileSync(join(ROOT, 'core', 'results.js'), 'utf8');
  assert.ok(src.includes('process.env.SCOUT_KEY'));
  assert.ok(!src.includes('scout-c1_'));
});

test('core/ modules exist', () => {
  assert.ok(existsSync(join(ROOT, 'core', 'constants.js')));
  assert.ok(existsSync(join(ROOT, 'core', 'probe.js')));
  assert.ok(existsSync(join(ROOT, 'core', 'runner.js')));
  assert.ok(existsSync(join(ROOT, 'core', 'runs.js')));
  assert.ok(existsSync(join(ROOT, 'core', 'results.js')));
  assert.ok(existsSync(join(ROOT, 'core', 'countries.js')));
});

test('index.js exists', () => {
  assert.ok(existsSync(join(ROOT, 'index.js')));
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
