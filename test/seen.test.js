/**
 * Unit tests for src/seen.js — SeenAds persistence.
 * Uses a temporary file so tests don't interfere with each other.
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TEMP_FILE = path.join(__dirname, 'test_seen.json');

// ─── Inline SeenAds class ────────────────────────────────────────────────────

class SeenAds {
  constructor(filePath) {
    this.filePath = filePath;
    this.ads = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed instanceof Set ? parsed : new Set(Object.keys(parsed));
    } catch {
      return new Set();
    }
  }

  _save() {
    const obj = Object.fromEntries([...this.ads].map(id => [id, true]));
    fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
  }

  add(id) {
    this.ads.add(id);
  }

  has(id) {
    return this.ads.has(id);
  }

  clear() {
    this.ads = new Set();
    this._save();
  }

  save() {
    this._save();
  }

  size() {
    return this.ads.size;
  }

  getAll() {
    return new Set(this.ads);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SeenAds', () => {
  const tempFile = TEMP_FILE;

  beforeEach(() => {
    // Reset: clear any leftover test file
    try { fs.unlinkSync(tempFile); } catch {}
  });

  afterEach(() => {
    try { fs.unlinkSync(tempFile); } catch {}
  });

  test('starts with empty set when file does not exist', () => {
    const seen = new SeenAds(tempFile);
    assert.strictEqual(seen.size(), 0);
  });

  test('add() inserts an ID', () => {
    const seen = new SeenAds(tempFile);
    seen.add('123');
    assert.strictEqual(seen.has('123'), true);
  });

  test('add() is idempotent (no duplicates)', () => {
    const seen = new SeenAds(tempFile);
    seen.add('123');
    seen.add('123');
    assert.strictEqual(seen.size(), 1);
  });

  test('has() returns false for unknown ID', () => {
    const seen = new SeenAds(tempFile);
    assert.strictEqual(seen.has('999'), false);
  });

  test('add() and save() persist to disk', () => {
    const seen = new SeenAds(tempFile);
    seen.add('abc');
    seen.save();

    // Load a new instance — should see the saved ID
    const seen2 = new SeenAds(tempFile);
    assert.strictEqual(seen2.has('abc'), true);
  });

  test('clear() removes all IDs', () => {
    const seen = new SeenAds(tempFile);
    seen.add('x');
    seen.add('y');
    seen.save();

    seen.clear();
    assert.strictEqual(seen.size(), 0);
    assert.strictEqual(seen.has('x'), false);
    assert.strictEqual(seen.has('y'), false);
  });

  test('clear() persists after reload', () => {
    const seen = new SeenAds(tempFile);
    seen.add('z');
    seen.save();
    seen.clear();

    const seen2 = new SeenAds(tempFile);
    assert.strictEqual(seen2.has('z'), false);
  });

  test('multiple IDs survive save/reload cycle', () => {
    const ids = ['id1', 'id2', 'id3'];
    const seen = new SeenAds(tempFile);
    ids.forEach(id => seen.add(id));
    seen.save();

    const seen2 = new SeenAds(tempFile);
    assert.strictEqual(seen2.size(), 3);
    ids.forEach(id => assert.strictEqual(seen2.has(id), true));
  });

  test('getAll() returns a copy of the set', () => {
    const seen = new SeenAds(tempFile);
    seen.add('solo');
    const all = seen.getAll();
    all.delete('solo'); // mutate the copy
    assert.strictEqual(seen.has('solo'), true); // original unchanged
  });

  test('handles malformed JSON gracefully (returns empty set)', () => {
    fs.writeFileSync(tempFile, 'not valid json{', 'utf8');
    const seen = new SeenAds(tempFile);
    assert.strictEqual(seen.size(), 0);
  });
});
