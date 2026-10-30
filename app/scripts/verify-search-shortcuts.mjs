import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { openCorpus, findNodes, exactlyOne, member, propertyName, sha256 } from './original-contracts/source.mjs';
import { normalizePlanner } from './verify-search-planner.mjs';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KERNEL = 'packages/frontend/src/components/shell/search/search-shortcuts.mjs';
export const UI = 'packages/frontend/src/components/shell/search/SearchDialog.tsx';
export const PROOF = 'reconstruction/search-shortcuts/PROVENANCE.json';
const expect = (value, message) => { if (!value) throw Error('unqualified search shortcut: ' + message); };
const unbound = (node) => node?.type === 'SequenceExpression' && node.expressions[0]?.value === 0 ? node.expressions[1] : node;

export async function verifySearchShortcuts(root = APP_ROOT) {
  const corpus = await openCorpus(root);
  const original = await corpus.factory(238128, { source: 'evidence/web/objects/ccb10fa3de5597c4.js' });
  const parent = await corpus.factory(400466, { source: 'evidence/web/objects/13c13db9eb86191b.js' });
  const kernelBytes = await readFile(path.join(root, KERNEL));
  const kernel = parse(kernelBytes.toString('utf8'), { sourceType: 'module' });
  const exported = (name) => exactlyOne(kernel.program.body.filter((node) => node.type === 'ExportNamedDeclaration')
    .map((node) => node.declaration).filter((node) => node?.id?.name === name), 'kernel export ' + name);
  const constructor = exported('createSearchShortcutHandler');
  expect(constructor.params.length === 1 && constructor.params[0].name === 'shortcuts' && constructor.body.body.length === 1 &&
    constructor.body.body[0].type === 'ReturnStatement' && constructor.body.body[0].argument.type === 'ArrowFunctionExpression', 'used matcher factory');
  const effect = exactlyOne(findNodes(original.node, (node) => node.type === 'ArrowFunctionExpression' && node.params.length === 0 &&
    node.body.type === 'BlockStatement' && node.body.body[0]?.type === 'VariableDeclaration' &&
    node.body.body[0].declarations[0]?.init?.type === 'ArrowFunctionExpression' &&
    findNodes(node, (entry) => entry.type === 'MemberExpression' && propertyName(entry.property) === 'isContentEditable').length === 1), 'mounted keyboard effect');
  const matcher = effect.body.body[0].declarations[0].init;
  const installedName = effect.body.body[0].declarations[0].id.name;
  for (const operation of ['addEventListener', 'removeEventListener']) {
    exactlyOne(findNodes(effect, (node) => node.type === 'CallExpression' && member(node.callee, 'window', operation) &&
      node.arguments[0]?.value === 'keydown' && node.arguments[1]?.name === installedName), 'actual mounted ' + operation);
  }
  const actual = normalizePlanner(constructor.body.body[0].argument, { shortcuts: 'bindings', Set: 'global:Set', normalizeSearchShortcutKey: 'normalize:key' });
  const expected = normalizePlanner(matcher, { e: 'bindings', Set: 'global:Set', eG: 'normalize:key' });
  expect(JSON.stringify(actual) === JSON.stringify(expected), 'complete mounted matcher AST differs');
  const key = exactlyOne(findNodes(original.node, (node) => node.type === 'FunctionDeclaration' && node.id.name === 'eG'), 'normalizer');
  const maintainedKey = exported('normalizeSearchShortcutKey');
  expect(key.params.length === 1 && maintainedKey.params.length === 1 && maintainedKey.params[0].type === 'Identifier' &&
    JSON.stringify(normalizePlanner(key.body, { e: 'key' })) ===
      JSON.stringify(normalizePlanner(maintainedKey.body, { [maintainedKey.params[0].name]: 'key' })), 'key normalizer AST differs');
  const bindings = exactlyOne(findNodes(original.node, (node) => node.type === 'AssignmentExpression' && node.left.name === 'e' && node.right.type === 'ArrayExpression' &&
    node.right.elements[0]?.type === 'ObjectExpression' && node.right.elements[0].properties.some((entry) => propertyName(entry.key) === 'keys')), 'actual shortcut configuration').right;
  expect(JSON.stringify(bindings.elements.map((entry) => entry.properties.find((item) => propertyName(item.key) === 'keys').value.elements.map((item) => item.value))) ===
    JSON.stringify([['Meta', 'k'], ['Control', 'k'], ['/']]), 'original keys');
  expect(bindings.elements.every((entry) => entry.properties.find((item) => propertyName(item.key) === 'callback').value.name === 'el'), 'same actual toggle callback');
  const toggle = exactlyOne(findNodes(original.node, (node) => node.type === 'VariableDeclarator' && node.id.name === 'el' &&
    node.init?.type === 'CallExpression' && member(unbound(node.init.callee), 'a', 'useCallback')), 'actual toggle callback');
  const toggleBody = toggle.init.arguments[0];
  const branch = toggleBody.body.body[0]?.expression;
  expect(toggleBody.type === 'ArrowFunctionExpression' && toggleBody.params.length === 0 && toggleBody.body.body.length === 1 &&
    branch?.type === 'ConditionalExpression' && branch.test.name === 'g' && branch.consequent.callee.name === 'ea' &&
    branch.consequent.arguments.length === 0 && branch.alternate.callee.name === 'b' && branch.alternate.arguments.length === 1 &&
    branch.alternate.arguments[0].type === 'UnaryExpression' && branch.alternate.arguments[0].operator === '!' && branch.alternate.arguments[0].argument.value === 0, 'source toggle branch');
  const close = exactlyOne(findNodes(original.node, (node) => node.type === 'VariableDeclarator' && node.id.name === 'ea' &&
    node.init?.type === 'CallExpression' && member(unbound(node.init.callee), 'a', 'useCallback')), 'actual close/reset callback');
  exactlyOne(findNodes(close.init.arguments[0], (node) => node.type === 'CallExpression' && node.callee.name === '_' &&
    node.arguments.length === 1 && node.arguments[0].value === ''), 'actual close clears query');
  const stateImport = exactlyOne(findNodes(original.node, (node) => node.type === 'VariableDeclarator' && node.id.name === 'e8' &&
    node.init?.type === 'CallExpression'), 'search state import');
  expect(member(stateImport.init.callee, original.runtime, 'i') && stateImport.init.arguments[0]?.value === 617614, 'search state dependency');
  const stateConsumers = ['g', 'b'].map((name) => exactlyOne(findNodes(original.node, (node) => node.type === 'VariableDeclarator' && node.id.name === name &&
    node.init?.type === 'CallExpression' && member(unbound(node.init.callee), 'e8', name === 'g' ? 'F' : 'Z')), 'used toggle state ' + name));
  const provider = await corpus.factory(617614, { source: 'evidence/web/objects/4da7a3f4580c8707.js' });
  for (const [name, field] of [['i', 'isSearchOpen'], ['a', 'setIsSearchOpen']]) {
    const selector = exactlyOne(findNodes(provider.node, (node) => node.type === 'VariableDeclarator' && node.id.name === name), 'actual store selector').init;
    expect(selector.type === 'ArrowFunctionExpression' && selector.params.length === 1 && member(selector.body, selector.params[0].name, field), 'selector field');
  }
  const stateExports = exactlyOne(findNodes(provider.node, (node) => node.type === 'CallExpression' && member(node.callee, provider.runtime, 's')), 'store exports').arguments[0].elements;
  expect(stateExports.length === 6 && stateExports[0].value === 'F' && stateExports[3].value === 'Z' &&
    stateExports[2].body.callee.name === 'n' && stateExports[2].body.arguments[0].name === 'i' &&
    stateExports[5].body.callee.name === 'n' && stateExports[5].body.arguments[0].name === 'a', 'actual store export wiring');
  const consumer = exactlyOne(findNodes(original.node, (node) => node.type === 'CallExpression' && member(unbound(node.callee), 'a', 'useEffect') && node.arguments[0]?.name === 'c' && node.arguments[1]?.name === 'u'), 'actual mounted keyboard effect consumer');
  const effectBinding = exactlyOne(findNodes(original.node, (node) => node.type === 'AssignmentExpression' && node.left.name === 'c' && node.right === effect), 'actual effect assignment');
  const source = await readFile(path.join(root, UI));
  const ui = parse(source.toString('utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const react = exactlyOne(ui.program.body.filter((node) => node.type === 'ImportDeclaration' && node.source.value === 'react'), 'UI React import');
  expect(react.specifiers.some((node) => node.imported?.name === 'useEffect' && node.local.name === 'useEffect'), 'actual UI effect import');
  // The merged clear-navigation listener shares this effect, but its ref is a
  // maintained UI binding, not an original matcher dependency. Keep the whole
  // effect fingerprinted and bind only the actual component-local React ref.
  expect(react.specifiers.some((node) => node.imported?.name === 'useRef' && node.local.name === 'useRef'), 'UI clear ref import');
  const component = exactlyOne(ui.program.body.filter((node) => node.type === 'ExportNamedDeclaration')
    .map((node) => node.declaration).filter((node) => node?.type === 'FunctionDeclaration' && node.id?.name === 'SearchDialog'), 'UI SearchDialog component');
  const clearRef = exactlyOne(component.body.body.filter((node) => node.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations).filter((node) => node.id.type === 'Identifier' && node.id.name === 'pendingClear'), 'UI clear ref declaration');
  expect(clearRef.init?.type === 'CallExpression' && clearRef.init.callee.type === 'Identifier' && clearRef.init.callee.name === 'useRef' &&
    clearRef.init.arguments.length === 1 && clearRef.init.arguments[0].type === 'BooleanLiteral' && clearRef.init.arguments[0].value === false, 'UI clear ref initializer');
  const imported = exactlyOne(ui.program.body.filter((node) => node.type === 'ImportDeclaration' && node.source.value === './search-shortcuts.mjs'), 'UI matcher import');
  expect(imported.specifiers.length === 1 && imported.specifiers[0].imported.name === 'createSearchShortcutHandler' && imported.specifiers[0].local.name === 'createSearchShortcutHandler', 'UI import identity');
  const constructed = exactlyOne(findNodes(ui, (node) => node.type === 'VariableDeclarator' && node.id.name === 'onKeyDown' &&
    node.init?.type === 'CallExpression' && node.init.callee.name === 'createSearchShortcutHandler'), 'actual used UI matcher');
  const installedEffect = exactlyOne(findNodes(ui, (node) => node.type === 'CallExpression' && node.callee.name === 'useEffect' &&
    node.arguments[0]?.type === 'ArrowFunctionExpression' && findNodes(node.arguments[0], (entry) => entry === constructed).length === 1), 'actual UI useEffect consumer');
  const uiBinding = normalizePlanner(installedEffect, { useEffect: 'react:useEffect', dialogRef: 'ui:dialogRef', closeMobile: 'ui:closeMobile',
    setQuery: 'ui:setQuery', pendingClear: 'ui:pendingClear', createSearchShortcutHandler: 'kernel:create', window: 'dom:window', onOpenSearch: 'ui:subscribe' });
  const input = constructed.init.arguments[0];
  expect(input?.type === 'ArrayExpression' && constructed.init.arguments.length === 1 &&
    JSON.stringify(input.elements.map((entry) => entry.properties.find((item) => propertyName(item.key) === 'keys').value.elements.map((item) => item.value))) ===
      JSON.stringify([['Meta', 'k'], ['Control', 'k'], ['/']]) &&
    input.elements.every((entry) => entry.properties.find((item) => propertyName(item.key) === 'callback').value.name === 'toggle'), 'UI shortcut wiring');
  for (const operation of ['addEventListener', 'removeEventListener']) {
    exactlyOne(findNodes(installedEffect.arguments[0], (node) => node.type === 'CallExpression' && member(node.callee, 'window', operation) &&
      node.arguments[0]?.value === 'keydown' && node.arguments[1]?.name === 'onKeyDown'), 'UI listener ' + operation);
  }
  // The predecessor belongs only to the period before the lazy child mounts.
  // Record it as distinct source evidence; never equate it with this matcher.
  const fallback = exactlyOne(findNodes(parent.node, (node) => node.type === 'ArrowFunctionExpression' && node.params.length === 0 &&
    node.body.type === 'BlockStatement' && node.body.body[0]?.type === 'IfStatement' &&
    findNodes(node, (entry) => entry.type === 'MemberExpression' && propertyName(entry.property) === 'isContentEditable').length === 1), 'pre-mount fallback effect');
  expect(fallback.body.body[0].test.name === 'eV', 'fallback gated by mounted flag');
  const mountedFlag = exactlyOne(findNodes(parent.node, (node) => node.type === 'VariableDeclarator' && node.id.type === 'ArrayPattern' &&
    node.id.elements[0]?.name === 'eV' && node.id.elements[1]?.name === 'eG' && member(unbound(node.init?.callee), 'a', 'useState')), 'actual mounted flag state');
  expect(mountedFlag.init.arguments[0]?.type === 'UnaryExpression' && mountedFlag.init.arguments[0].operator === '!' && mountedFlag.init.arguments[0].argument.value === 1, 'mounted flag initially false');
  const markMounted = exactlyOne(findNodes(parent.node, (node) => node.type === 'ArrowFunctionExpression' && node.body.type === 'CallExpression' &&
    node.body.callee.name === 'eG' && node.body.arguments[0]?.type === 'UnaryExpression' && node.body.arguments[0].argument.value === 0), 'real flag setter');
  const mountedAlias = exactlyOne(findNodes(parent.node, (node) => node.type === 'VariableDeclarator' && node.id.name === 'e$' && node.init?.name === 's'), 'mounted callback alias');
  const markAssignment = exactlyOne(findNodes(parent.node, (node) => node.type === 'AssignmentExpression' && node.left.name === 's' && node.right === markMounted), 'actual mounted callback assignment');
  const mounted = exactlyOne(findNodes(parent.node, (node) => node.type === 'ObjectProperty' && propertyName(node.key) === 'onMounted' && node.value.name === 'e$'), 'actual mounted handoff');
  return { schemaVersion: 1, kernelSha256: sha256(kernelBytes), uiBindingSha256: sha256(JSON.stringify(uiBinding)),
    manifestSha256: corpus.anchors.manifestSha256,
    normalizedMatcherSha256: sha256(JSON.stringify(expected)),
    proofs: [original.witness(matcher, 'complete mounted keyboard matcher'), original.witness(key, 'used lower-case normalizer'),
      original.witness(bindings, 'actual mounted shortcut configuration'), original.witness(toggle, 'actual toggle callback'),
      original.witness(close, 'actual used close/reset boundary, broader request/filter cleanup not reconstructed'),
      original.witness(effect, 'actual mounted listener install and cleanup'), original.witness(effectBinding, 'actual keyboard effect assignment'),
      original.witness(consumer, 'actual mounted useEffect consumer'), original.witness(stateImport, 'actual open-state dependency'),
      ...stateConsumers.map((node) => original.witness(node, 'actual used toggle state')),
      provider.witness(provider.node, 'selected captured search-open store boundary'), parent.witness(fallback, 'distinct pre-mount fallback'),
      parent.witness(mountedFlag, 'actual initially-false mounted state'), parent.witness(markAssignment, 'actual onMounted flag update'),
      parent.witness(mountedAlias, 'used onMounted callback alias'), parent.witness(mounted, 'actual lazy child onMounted handoff')],
    limits: ['Exact bounded matcher/normalizer AST comparison reuses unchanged planner infrastructure; no captured bundle execution.',
      'The mounted matcher differs from the pre-mount fallback: modified shortcuts may run inside editors, and extra modifiers must match exactly.',
      'The maintained UI is eagerly mounted. Dynamic loading, React scheduling, module warmup and full original close/reset/request lifecycle are not reconstructed.'] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2]; expect(['--write', '--check'].includes(mode) && process.argv.length === 3, 'usage --write|--check');
    const output = JSON.stringify(await verifySearchShortcuts(), null, 2) + '\n';
    if (mode === '--write') { await mkdir(path.join(APP_ROOT, 'reconstruction/search-shortcuts'), { recursive: true }); await writeFile(path.join(APP_ROOT, PROOF), output); }
    else expect(await readFile(path.join(APP_ROOT, PROOF), 'utf8') === output, 'saved proof differs');
    console.log('Search shortcuts: mounted matcher, used configuration and distinct pre-mount handoff authenticated without capture execution.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
