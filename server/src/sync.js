import { fetchSubmissionPage, fetchSubmissionDetails } from './leetcodeClient.js';
import { upsertProblem, getSubmissionIdForSlug } from './db.js';

const PAGE_SIZE = 20;
const REQUEST_DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walks the user's submission history (newest first) and keeps the most
 * recent Accepted submission per problem slug.
 */
async function collectLatestAcceptedSubmissions(onProgress) {
  const bySlug = new Map();
  let offset = 0;
  let lastKey = null;
  let hasNext = true;
  let pagesFetched = 0;

  while (hasNext) {
    const page = await fetchSubmissionPage(offset, PAGE_SIZE, lastKey);
    pagesFetched += 1;
    for (const sub of page.submissions) {
      if (sub.statusDisplay === 'Accepted' && !bySlug.has(sub.titleSlug)) {
        bySlug.set(sub.titleSlug, sub);
      }
    }
    onProgress?.({ phase: 'listing', pagesFetched, foundSoFar: bySlug.size });
    hasNext = page.hasNext;
    lastKey = page.lastKey;
    offset += PAGE_SIZE;
    if (hasNext) await sleep(REQUEST_DELAY_MS);
  }

  return bySlug;
}

export async function runSync(onProgress) {
  const latestBySlug = await collectLatestAcceptedSubmissions(onProgress);

  let updated = 0;
  let skipped = 0;
  let i = 0;

  for (const [slug, sub] of latestBySlug) {
    i += 1;
    const knownSubmissionId = getSubmissionIdForSlug(slug);
    if (knownSubmissionId === String(sub.id)) {
      skipped += 1;
      onProgress?.({ phase: 'detail', index: i, total: latestBySlug.size, slug, skipped: true });
      continue;
    }

    const details = await fetchSubmissionDetails(sub.id);
    const q = details.question;

    upsertProblem({
      slug: q.titleSlug,
      questionId: q.questionId,
      title: q.title,
      difficulty: q.difficulty,
      tags: JSON.stringify(q.topicTags.map((t) => t.name)),
      contentHtml: q.content,
      sampleTestcase: q.sampleTestCase,
      exampleTestcases: q.exampleTestcases,
      code: details.code,
      lang: details.lang?.verboseName ?? details.lang?.name ?? sub.lang,
      submissionId: String(sub.id),
      submittedAt: Number(sub.timestamp),
      syncedAt: Math.floor(Date.now() / 1000),
    });

    updated += 1;
    onProgress?.({ phase: 'detail', index: i, total: latestBySlug.size, slug, skipped: false });
    await sleep(REQUEST_DELAY_MS);
  }

  return { totalAccepted: latestBySlug.size, updated, skipped };
}
