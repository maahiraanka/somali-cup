import { bootstrapDatabase } from './apps/api/src/db/bootstrap.js';

try {
  await bootstrapDatabase();
  await import('./apps/api/src/server.js');
} catch (error) {
  console.error('[startup] Somali Cup failed to bootstrap:', error);
  process.exit(1);
}
