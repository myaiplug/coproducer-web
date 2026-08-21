import { strict as assert } from 'node:assert';
import { fmt } from './report.js';

assert.equal(fmt(null), '—');
assert.equal(fmt(-14, 1), '-14.0');
console.log('report fmt ok');
