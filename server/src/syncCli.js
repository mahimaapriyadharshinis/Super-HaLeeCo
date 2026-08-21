import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runSync } from './sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const summary = await runSync((progress) => {
  if (progress.phase === 'listing') {
    process.stdout.write(`\rScanning submissions... page ${progress.pagesFetched}, ${progress.foundSoFar} accepted found`);
  } else {
    process.stdout.write(
      `\r[${progress.index}/${progress.total}] ${progress.skipped ? 'up to date' : 'synced'}: ${progress.slug}          `
    );
  }
});

console.log('\n\nDone.', summary);
