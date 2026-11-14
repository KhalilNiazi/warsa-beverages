import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('api.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const targetNames = new Set([
  'normalizeAssignedRoutes',
  'normalizePulledOrderBookers',
  'normalizePulledDeliveryMen'
]);
const declarations = sourceFile.statements
  .filter(statement =>
    ts.isFunctionDeclaration(statement) &&
    statement.name &&
    targetNames.has(statement.name.text)
  )
  .map(statement => statement.getText(sourceFile));

assert.equal(declarations.length, targetNames.size, 'Expected to find all Order Booker normalizers');

const javascript = ts.transpileModule(declarations.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None }
}).outputText;
const normalizers = new Function(`${javascript}; return { normalizePulledOrderBookers, normalizePulledDeliveryMen };`)();

const orderBookers = normalizers.normalizePulledOrderBookers([
  { ID: 1731234567890, Name: '  Aoun Ali  ', Phone: 3001234567, AssignedRoutes: 'Route A, Route B' },
  { id: 1731234567891, Name: 'Sara', Phone: '03001234567', AssignedRoutes: '["Route C"]' },
  { ID: 12, Name: '   ', Phone: 123 }
]);
const deliveryMen = normalizers.normalizePulledDeliveryMen([
  { ID: 1731234567892, Name: '  Ali Driver ', Phone: 3007654321 }
]);

assert.equal(orderBookers.length, 2);
assert.equal(orderBookers[0].ID, '1731234567890');
assert.equal(typeof orderBookers[0].ID, 'string');
assert.equal(orderBookers[0].Phone, '3001234567');
assert.equal(typeof orderBookers[0].Phone, 'string');
assert.equal(orderBookers[0].AssignedRoutes.join('|'), 'Route A|Route B');
assert.equal(orderBookers[1].Phone, '03001234567');
assert.equal(orderBookers[1].AssignedRoutes[0], 'Route C');
assert.equal(deliveryMen[0].ID, '1731234567892');
assert.equal(deliveryMen[0].Phone, '3007654321');
assert.equal(typeof deliveryMen[0].Phone, 'string');

console.log('Order Booker ID/phone and Delivery Man ID/phone normalize to strings; leading-zero phone is preserved.');
