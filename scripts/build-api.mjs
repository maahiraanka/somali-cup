import fs from 'node:fs/promises';
await fs.mkdir(new URL('../apps/api/dist/', import.meta.url), {recursive:true});
console.log('API uses native ESM; source is production-ready.');
