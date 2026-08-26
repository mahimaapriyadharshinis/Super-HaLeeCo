import { importPublicProblem } from './importProblem.js';
import { listProblems } from './db.js';

// A small, varied set across all three judges for DEMO_MODE — lets a hosted
// public demo show something real with zero login required. AI solutions
// are attempted but skipped gracefully if no GEMINI_API_KEY is configured.
const DEMO_LEETCODE_SLUGS = [
  'two-sum',
  'add-two-numbers',
  'longest-substring-without-repeating-characters',
  'valid-parentheses',
  'merge-two-sorted-lists',
  'maximum-subarray',
  'climbing-stairs',
  'binary-tree-inorder-traversal',
  'maximum-depth-of-binary-tree',
  'best-time-to-buy-and-sell-stock',
  'reverse-linked-list',
  'invert-binary-tree',
  'lru-cache',
];

const DEMO_CODEFORCES = [
  ['4', 'A'],
  ['1', 'A'],
];

const DEMO_HACKERRANK = ['solve-me-first', 'simple-array-sum'];

export async function seedDemoDeck() {
  if (listProblems({}).length > 0) {
    console.log('DEMO_MODE: deck already has problems, skipping seed.');
    return;
  }

  console.log('DEMO_MODE: seeding a sample public deck (no login required)...');

  for (const slug of DEMO_LEETCODE_SLUGS) {
    try {
      await importPublicProblem('leetcode', slug, { wantSolution: true, language: 'Python' });
    } catch (err) {
      console.warn(`  skip leetcode/${slug}: ${err.message}`);
    }
  }
  for (const [contestId, index] of DEMO_CODEFORCES) {
    try {
      await importPublicProblem('codeforces', `${contestId}:${index}`, {
        wantSolution: true,
        language: 'Python',
      });
    } catch (err) {
      console.warn(`  skip codeforces/${contestId}${index}: ${err.message}`);
    }
  }
  for (const id of DEMO_HACKERRANK) {
    try {
      await importPublicProblem('hackerrank', id, { wantSolution: true, language: 'Python' });
    } catch (err) {
      console.warn(`  skip hackerrank/${id}: ${err.message}`);
    }
  }

  console.log('DEMO_MODE: seeding complete.');
}
