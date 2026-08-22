import * as cheerio from 'cheerio';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Codeforces' Cloudflare check blocks Node's fetch() and even headless
// Chromium (both get a 403), but plain curl passes — shell out to the curl
// binary that ships with Windows 10/11 instead.
async function curlGet(url) {
  const { stdout } = await execFileAsync(
    'curl',
    ['-s', '--max-time', '15', '-A', BROWSER_UA, '-H', 'Accept: text/html', url],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  return stdout;
}

let cache = { problems: null, fetchedAt: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000;

async function getProblemList() {
  if (cache.problems && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.problems;
  }
  const res = await fetch('https://codeforces.com/api/problemset.problems');
  if (!res.ok) throw new Error(`Codeforces API request failed: ${res.status}`);
  const json = await res.json();
  if (json.status !== 'OK') throw new Error('Codeforces API returned an error');
  cache = { problems: json.result.problems, fetchedAt: Date.now() };
  return cache.problems;
}

function difficultyFromRating(rating) {
  if (!rating) return 'Medium';
  if (rating <= 1200) return 'Easy';
  if (rating <= 1900) return 'Medium';
  return 'Hard';
}

function toSummary(p) {
  return {
    id: `${p.contestId}${p.index}`,
    contestId: p.contestId,
    index: p.index,
    name: p.name,
    difficulty: difficultyFromRating(p.rating),
    rating: p.rating ?? null,
    tags: p.tags,
  };
}

export async function fetchRandomCodeforcesProblem() {
  const problems = await getProblemList();
  const p = problems[Math.floor(Math.random() * problems.length)];
  return toSummary(p);
}

// Our canonical topic slugs -> the closest matching Codeforces tag string.
// Deliberately only the confident 1:1 mappings; anything else returns null
// so the caller can fall back to a plain random pick.
const CF_TAG_MAP = {
  string: 'strings',
  'hash-table': 'hashing',
  'two-pointers': 'two pointers',
  'binary-search': 'binary search',
  sorting: 'sortings',
  'divide-and-conquer': 'divide and conquer',
  tree: 'trees',
  'binary-tree': 'trees',
  'binary-search-tree': 'trees',
  graph: 'graphs',
  'breadth-first-search': 'graphs',
  'depth-first-search': 'dfs and similar',
  'union-find': 'dsu',
  'topological-sort': 'graphs',
  'dynamic-programming': 'dp',
  greedy: 'greedy',
  backtracking: 'dfs and similar',
  'bit-manipulation': 'bitmasks',
  math: 'math',
  matrix: 'matrices',
};

export async function fetchRandomCodeforcesProblemByTopic(topicSlug, excludeIds = []) {
  const cfTag = CF_TAG_MAP[topicSlug];
  if (!cfTag) return null;
  const problems = await getProblemList();
  const excluded = new Set(excludeIds);
  const matches = problems.filter(
    (p) => p.tags.includes(cfTag) && !excluded.has(`${p.contestId}${p.index}`)
  );
  if (matches.length === 0) return null;
  return toSummary(matches[Math.floor(Math.random() * matches.length)]);
}

export async function fetchCodeforcesStatement(contestId, index) {
  const url = `https://codeforces.com/problemset/problem/${contestId}/${index}`;
  let html;
  try {
    html = await curlGet(url);
  } catch (err) {
    throw new Error(`Could not fetch Codeforces problem ${contestId}${index}: ${err.message}`);
  }
  if (!html || !html.includes('problem-statement')) {
    throw new Error(`Could not fetch Codeforces problem ${contestId}${index} (blocked or not found)`);
  }
  const $ = cheerio.load(html);
  const statement = $('.problem-statement').first();
  if (statement.length === 0) {
    throw new Error(`Could not find a problem statement for ${contestId}${index}`);
  }

  const rawTitle = statement.find('.header .title').first().text().trim();
  // Codeforces titles look like "A. Problem Name" — strip the leading letter.
  const title = rawTitle.replace(/^[A-Z][0-9]?\.\s*/, '') || `Problem ${contestId}${index}`;

  // Drop just the title (shown separately as the card title) but keep the
  // rest of .header — time/memory limits are useful, like LeetCode's constraints.
  statement.find('.header .title').first().remove();
  const contentHtml = statement.html() ?? '';

  return { title, contentHtml };
}
