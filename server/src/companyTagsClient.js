// Tags problems with which companies have asked them, sourced live from a
// public community dataset (krishnadey30/LeetCode-Questions-CompanyWise).
// That repo carries no license, so nothing from it is vendored into this
// repo — every sync fetches fresh, exactly like the LeetCode/Codeforces/
// HackerRank clients fetch their own data live rather than bundling it.
const REPO_CONTENTS_API =
  'https://api.github.com/repos/krishnadey30/LeetCode-Questions-CompanyWise/contents/';
const RAW_BASE = 'https://raw.githubusercontent.com/krishnadey30/LeetCode-Questions-CompanyWise/master/';

function companyNameFromFile(filename) {
  const base = filename.replace(/_(alltime|6months|1year|2year)\.csv$/i, '');
  return base
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function slugFromCsvLine(line) {
  const match = line.match(/leetcode\.com\/problems\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function parseCompanyCsvLine(line) {
  const match = line.match(
    /^\d+,(.+?),[\d.]+%,(Easy|Medium|Hard),[\d.]+,\s*https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)/i
  );
  if (!match) return null;
  return { title: match[1].trim(), difficulty: match[2], slug: match[3].toLowerCase() };
}

async function fetchCompanyFileList() {
  const res = await fetch(REPO_CONTENTS_API, {
    headers: { 'User-Agent': 'haleeco-app', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Could not list company data files (GitHub API ${res.status}).`);
  const files = await res.json();
  return files.filter((f) => f.name.endsWith('_alltime.csv')).map((f) => f.name);
}

async function fetchCompanySlugs(filename) {
  const res = await fetch(RAW_BASE + filename);
  if (!res.ok) return [];
  const text = await res.text();
  return text.split('\n').slice(1).map(slugFromCsvLine).filter(Boolean);
}

async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// The full list of companies in the dataset, for browsing questions that
// aren't in your deck yet — not to be confused with listAllCompanies() in
// db.js, which only lists companies already tagged on your local problems.
export async function listCompanyCatalog() {
  const files = await fetchCompanyFileList();
  return files.map((f) => companyNameFromFile(f)).sort((a, b) => a.localeCompare(b));
}

// All problems the dataset associates with one company, independent of
// whether you already have them in your deck.
export async function fetchCompanyProblems(companyName) {
  const files = await fetchCompanyFileList();
  const file = files.find((f) => companyNameFromFile(f).toLowerCase() === companyName.toLowerCase());
  if (!file) throw new Error(`No data found for "${companyName}".`);

  const res = await fetch(RAW_BASE + file);
  if (!res.ok) throw new Error(`Could not fetch data for "${companyName}" (${res.status}).`);
  const text = await res.text();
  return text.split('\n').slice(1).map(parseCompanyCsvLine).filter(Boolean);
}

// Returns Map<leetcodeSlug, Set<companyName>> across every company file.
export async function buildCompanySlugMap() {
  const files = await fetchCompanyFileList();
  const slugToCompanies = new Map();

  await mapWithConcurrency(files, 10, async (filename) => {
    const company = companyNameFromFile(filename);
    const slugs = await fetchCompanySlugs(filename);
    for (const slug of slugs) {
      if (!slugToCompanies.has(slug)) slugToCompanies.set(slug, new Set());
      slugToCompanies.get(slug).add(company);
    }
  });

  return slugToCompanies;
}
