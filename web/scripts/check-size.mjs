import { statSync } from 'node:fs';

const file = 'public/js/app.js';
const limit = 80 * 1024;
const size = statSync(file).size;

if (size > limit) {
  console.error(`${file} is ${size} bytes, over the ${limit} byte limit.`);
  process.exit(1);
}
console.log(`${file}: ${size} bytes (limit ${limit}).`);
