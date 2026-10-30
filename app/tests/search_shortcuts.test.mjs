import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdtemp, mkdir, link, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSearchShortcutHandler, normalizeSearchShortcutKey } from '../packages/frontend/src/components/shell/search/search-shortcuts.mjs';
import { APP_ROOT, KERNEL, UI, PROOF, verifySearchShortcuts } from '../scripts/verify-search-shortcuts.mjs';

function keyEvent(key, options = {}) {
  const calls = [];
  const event = { key, target: { tagName: 'BUTTON', isContentEditable: false },
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    preventDefault() { calls.push('prevent'); }, ...options };
  return { event, calls };
}
const bindings = (callback) => [{ keys: ['Meta', 'k'], callback }, { keys: ['Control', 'k'], callback }, { keys: ['/'], callback }];

test('actual mounted matcher, keys, consumer and distinct fallback source reproduce', async () => {
  assert.deepEqual(await verifySearchShortcuts(), JSON.parse(await readFile(path.join(APP_ROOT, PROOF), 'utf8')));
});

test('exact modifier sets preserve Ctrl/Meta K, case normalization and bare slash', () => {
  for (const options of [{ key: 'k', ctrlKey: true }, { key: 'K', metaKey: true }, { key: '/' }]) {
    const { event, calls } = keyEvent(options.key, options);
    createSearchShortcutHandler(bindings(() => calls.push('callback')))(event);
    assert.deepEqual(calls, ['prevent', 'callback']);
  }
  for (const options of [{ key: 'k' }, { key: 'k', ctrlKey: true, shiftKey: true },
    { key: 'k', metaKey: true, altKey: true }, { key: 'k', ctrlKey: true, metaKey: true },
    { key: '/', shiftKey: true }, { key: '/', altKey: true }, { key: '?' }, { key: undefined }]) {
    const { event, calls } = keyEvent(options.key, options);
    createSearchShortcutHandler(bindings(() => calls.push('callback')))(event);
    assert.deepEqual(calls, []);
  }
});

test('mounted editor admission ignores bare text keys but permits matching modified shortcuts', () => {
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SPAN', isContentEditable: true }]) {
    const plain = keyEvent('/', { target });
    createSearchShortcutHandler(bindings(() => plain.calls.push('callback')))(plain.event);
    assert.deepEqual(plain.calls, []);
    const modified = keyEvent('k', { target, ctrlKey: true });
    createSearchShortcutHandler(bindings(() => modified.calls.push('callback')))(modified.event);
    assert.deepEqual(modified.calls, ['prevent', 'callback']);
  }
});

test('normalizer lowercases only; it does not invent modifier aliases or trim keys', () => {
  assert.equal(normalizeSearchShortcutKey('MeTa'), 'meta');
  assert.equal(normalizeSearchShortcutKey(' Meta '), ' meta ');
  const { event, calls } = keyEvent('k', { metaKey: true });
  createSearchShortcutHandler([{ keys: ['Command', 'k'], callback: () => calls.push('callback') }])(event);
  assert.deepEqual(calls, []);
  assert.throws(() => normalizeSearchShortcutKey(null), TypeError);
});

test('callback receiver/order, thrown errors and multiple matches preserve source behavior', () => {
  const { event, calls } = keyEvent('/', { defaultPrevented: true });
  const failure = Error('synthetic callback');
  const handler = createSearchShortcutHandler([{ keys: ['/'], callback: function () {
    assert.equal(this, undefined); calls.push('first'); throw failure;
  } }, { keys: ['/'], callback: () => calls.push('later') }]);
  assert.throws(() => handler(event), (error) => error === failure);
  assert.deepEqual(calls, ['prevent', 'first']);
  const second = keyEvent('/');
  createSearchShortcutHandler([{ keys: ['/'], callback: () => second.calls.push('a') },
    { keys: ['/'], callback: () => second.calls.push('b') }])(second.event);
  assert.deepEqual(second.calls, ['prevent', 'a', 'prevent', 'b']);
});

test('the callback retains actual binding references and does not add target-shape validation', () => {
  const { event, calls } = keyEvent('/');
  const options = [];
  const handler = createSearchShortcutHandler(options);
  options.push({ keys: ['/'], callback: () => calls.push('late binding') });
  handler(event);
  assert.deepEqual(calls, ['prevent', 'late binding']);
  assert.throws(() => handler({ ...event, target: null }), TypeError);
});

async function mutated(t, file, change) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'search-shortcuts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const proof = JSON.parse(await readFile(path.join(APP_ROOT, PROOF), 'utf8'));
  const immutable = new Set(['evidence/web/manifest.json', 'recovered/modules.json', ...proof.proofs.map((entry) => entry.source)]);
  for (const name of immutable) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    try { await link(path.join(APP_ROOT, name), path.join(root, name)); }
    catch (error) { if (error.code !== 'EXDEV') throw error; await copyFile(path.join(APP_ROOT, name), path.join(root, name)); }
  }
  for (const name of [KERNEL, UI]) { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await copyFile(path.join(APP_ROOT, name), path.join(root, name)); }
  const target = path.join(root, file), before = await readFile(target, 'utf8'), after = change(before);
  assert.notEqual(after, before, 'mutation must change the tested input');
  await writeFile(target, after); return root;
}
test('source proof rejects modifier/editor/normalizer and actual UI-wiring mutations', async (t) => {
  for (const [file, change] of [[KERNEL, (text) => text.replace('pressed.size === normalized.length', 'pressed.size >= normalized.length')],
    [KERNEL, (text) => text.replace('(!editing || modified)', '(!editing)')],
    [KERNEL, (text) => text.replace('return key.toLowerCase()', 'return key.trim().toLowerCase()')],
    [UI, (text) => text.replace('{ keys: ["/"], callback: toggle }', '{ keys: ["?"], callback: toggle }')]]) {
    await assert.rejects(verifySearchShortcuts(await mutated(t, file, change)), /AST differs|UI shortcut wiring/);
  }
});

test('normalizer proof binds the maintained parameter, not the name key', async (t) => {
  const declaration = 'normalizeSearchShortcutKey(key) { return key.toLowerCase(); }';
  // A half-done rename leaves `key` free: every keydown would throw ReferenceError.
  await assert.rejects(verifySearchShortcuts(await mutated(t, KERNEL, (text) => text.replace(declaration,
    'normalizeSearchShortcutKey(value) { return key.toLowerCase(); }'))), /unresolved planner bindings: key/);
  // A consistent rename is alpha-equivalent to the captured normalizer.
  const { kernelSha256, ...renamed } = await verifySearchShortcuts(await mutated(t, KERNEL, (text) => text.replace(declaration,
    'normalizeSearchShortcutKey(value) { return value.toLowerCase(); }')));
  const { kernelSha256: savedKernelSha256, ...saved } = JSON.parse(await readFile(path.join(APP_ROOT, PROOF), 'utf8'));
  assert.notEqual(kernelSha256, savedKernelSha256);
  assert.deepEqual(renamed, saved);
});

test('the separately published Escape render handler does not stale this bounded caller binding', async (t) => {
  // PR886's real render event is outside the shortcut effect. This proves only
  // static proof composability, not a new browser/union qualification.
  const overlay = (text) => text.replace('aria-label="Search for coins and users"', `aria-label="Search for coins and users"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // A populated search input otherwise clears itself before native
        // dialog cancellation. The modal owns this key and preserves the draft.
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.close();
      }}`);
  assert.deepEqual(await verifySearchShortcuts(await mutated(t, UI, overlay)), JSON.parse(await readFile(path.join(APP_ROOT, PROOF), 'utf8')));
});
