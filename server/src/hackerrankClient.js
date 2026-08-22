const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BASE = 'https://www.hackerrank.com/rest/contests/master/challenges';

async function hrFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HackerRank request failed: ${res.status}`);
  return res.json();
}

export async function fetchRandomHackerRankChallenge() {
  const first = await hrFetch(`${BASE}?limit=1&offset=0`);
  const total = first.total ?? 0;
  if (!total) throw new Error('Could not read the HackerRank challenge catalog');

  const offset = Math.floor(Math.random() * total);
  const page = await hrFetch(`${BASE}?limit=1&offset=${offset}`);
  const model = page.models?.[0];
  if (!model) throw new Error('HackerRank returned no challenge at that offset');

  return {
    slug: model.slug,
    name: model.name,
    difficulty: model.difficulty_name || 'Medium',
    preview: model.preview,
  };
}

export async function fetchHackerRankChallengeDetail(slug) {
  const data = await hrFetch(`${BASE}/${encodeURIComponent(slug)}`);
  const m = data.model;
  if (!m) throw new Error(`No HackerRank challenge found for "${slug}"`);

  return {
    slug: m.slug,
    title: m.name,
    difficulty: m.difficulty_name || 'Medium',
    contentHtml: m.body_html || `<p>${m.preview || ''}</p>`,
    category: m.category,
  };
}
