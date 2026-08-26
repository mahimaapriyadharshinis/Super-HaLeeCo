import { fetchPublicQuestion } from './leetcodeClient.js';
import { fetchCodeforcesStatement } from './codeforcesClient.js';
import { fetchHackerRankChallengeDetail } from './hackerrankClient.js';
import { getProblem, upsertProblem } from './db.js';
import { generateSolution, aiEnabled } from './aiGenerate.js';

// Shared by the /api/problems/import route and the demo-mode seed script —
// fetches a public problem from whichever judge and normalizes it into the
// shape upsertProblem expects.
export async function importPublicProblem(platform, id, { wantSolution = false, language } = {}) {
  let slug, title, difficulty, tags, contentHtml, sourceUrl, questionId, sampleTestcase, exampleTestcases;

  if (platform === 'leetcode') {
    const q = await fetchPublicQuestion(id);
    slug = q.titleSlug;
    title = q.title;
    difficulty = q.difficulty;
    tags = q.topicTags.map((t) => t.name);
    contentHtml = q.content;
    sourceUrl = `https://leetcode.com/problems/${q.titleSlug}/`;
    questionId = q.questionId;
    sampleTestcase = q.sampleTestCase;
    exampleTestcases = q.exampleTestcases;
  } else if (platform === 'codeforces') {
    const [contestId, index] = id.split(':');
    const p = await fetchCodeforcesStatement(contestId, index);
    slug = `cf-${contestId}-${index.toLowerCase()}`;
    title = `${contestId}${index}. ${p.title}`;
    difficulty = 'Medium';
    tags = [];
    contentHtml = p.contentHtml;
    sourceUrl = `https://codeforces.com/problemset/problem/${contestId}/${index}`;
  } else if (platform === 'hackerrank') {
    const c = await fetchHackerRankChallengeDetail(id);
    slug = `hr-${c.slug}`;
    title = c.title;
    difficulty = c.difficulty;
    tags = c.category ? [c.category] : [];
    contentHtml = c.contentHtml;
    sourceUrl = `https://www.hackerrank.com/challenges/${c.slug}/problem`;
  } else {
    throw new Error(`Unknown platform "${platform}"`);
  }

  // Never let an import clobber a real synced solve of yours that happens
  // to share the same slug (e.g. re-importing "two-sum" for an AI answer).
  const existing = getProblem(slug);
  if (existing && existing.source === 'own') return existing;

  let code = '';
  let source = 'manual';
  let lang = language || 'plaintext';

  if (wantSolution && aiEnabled()) {
    code = await generateSolution({ title, contentHtml, difficulty, language: language || 'Python' });
    source = 'ai';
    lang = language || 'Python';
  }

  upsertProblem({
    slug,
    questionId: questionId ?? null,
    title,
    difficulty,
    tags: JSON.stringify(tags),
    contentHtml,
    sampleTestcase: sampleTestcase ?? '',
    exampleTestcases: exampleTestcases ?? '',
    code,
    lang,
    submissionId: null,
    submittedAt: Math.floor(Date.now() / 1000),
    syncedAt: Math.floor(Date.now() / 1000),
    source,
    platform,
    sourceUrl,
  });

  return getProblem(slug);
}
