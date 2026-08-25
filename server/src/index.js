import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import {
  listProblems,
  getProblem,
  allTags,
  upsertProblem,
  updateProblemFields,
  deleteProblem,
  slugExists,
  pingActivity,
  getActivity,
  listSolvedProblems,
} from './db.js';
import { runSync } from './sync.js';
import {
  searchPublicQuestions,
  fetchRandomPublicQuestion,
  fetchPublicQuestion,
  fetchCurrentUsername,
  fetchRandomQuestionByTag,
} from './leetcodeClient.js';
import {
  fetchRandomCodeforcesProblem,
  fetchCodeforcesStatement,
  fetchRandomCodeforcesProblemByTopic,
} from './codeforcesClient.js';
import {
  fetchRandomHackerRankChallenge,
  fetchHackerRankChallengeDetail,
} from './hackerrankClient.js';
import { aiEnabled, generateSolution } from './aiGenerate.js';
import { slugify } from './util.js';
import { startBrowserLogin, getLoginState, updateEnvFile } from './browserLogin.js';
import { getTopicAnalysis, pickWeakTopic } from './analysis.js';
import {
  getTodaysDailySet,
  addMoreDailyCards,
  completeDailyCard,
  getOrGenerateQuiz,
  answerQuizQuestion,
} from './daily.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/config', (_req, res) => {
  res.json({ aiEnabled: aiEnabled() });
});

// ---- LeetCode login (browser-assisted, no passwords touch this app) ----

app.get('/api/auth/status', async (_req, res) => {
  const connected = !!(process.env.LEETCODE_SESSION && process.env.LEETCODE_CSRFTOKEN);
  let username = null;
  if (connected) {
    try {
      username = await fetchCurrentUsername();
    } catch {
      username = null;
    }
  }
  res.json({ connected: connected && !!username, username });
});

app.post('/api/auth/login', (_req, res) => {
  res.json(startBrowserLogin());
});

app.get('/api/auth/login/status', (_req, res) => {
  res.json(getLoginState());
});

// Fallback for when the browser-popup flow can't complete (LeetCode's
// Cloudflare check reliably stalls on a fresh automated browser profile —
// this is a known, structural limitation, not a fluke). You paste the two
// cookie values yourself from a normal logged-in browser tab.
app.post('/api/auth/manual', async (req, res) => {
  const { session, csrfToken } = req.body;
  if (!session || !csrfToken) {
    return res.status(400).json({ error: 'Both session and csrfToken are required' });
  }
  process.env.LEETCODE_SESSION = session;
  process.env.LEETCODE_CSRFTOKEN = csrfToken;
  updateEnvFile({ LEETCODE_SESSION: session, LEETCODE_CSRFTOKEN: csrfToken });

  try {
    const username = await fetchCurrentUsername();
    if (!username) {
      return res.status(400).json({ error: 'Those values were saved, but LeetCode says this session is not signed in — double check you copied both values while logged in.' });
    }
    res.json({ connected: true, username });
  } catch (err) {
    res.status(400).json({ error: `Saved, but couldn't verify it: ${err.message}` });
  }
});

app.get('/api/problems', (req, res) => {
  const { difficulty, tag, q, source } = req.query;
  res.json(listProblems({ difficulty, tag, q, source }));
});

app.get('/api/tags', (_req, res) => {
  res.json(allTags());
});

app.get('/api/problems/:slug', (req, res) => {
  const problem = getProblem(req.params.slug);
  if (!problem) return res.status(404).json({ error: 'Not found' });
  res.json(problem);
});

app.patch('/api/problems/:slug', (req, res) => {
  if (!getProblem(req.params.slug)) return res.status(404).json({ error: 'Not found' });
  updateProblemFields(req.params.slug, req.body);
  res.json(getProblem(req.params.slug));
});

app.delete('/api/problems/:slug', (req, res) => {
  deleteProblem(req.params.slug);
  res.status(204).end();
});

let syncInProgress = false;

app.post('/api/sync', async (_req, res) => {
  if (syncInProgress) {
    return res.status(409).json({ error: 'A sync is already running' });
  }
  syncInProgress = true;
  try {
    const summary = await runSync();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    syncInProgress = false;
  }
});

// ---- Public LeetCode browsing (not tied to your own submissions) ----

app.get('/api/leetcode/search', async (req, res) => {
  try {
    const results = await searchPublicQuestions(req.query.q || '', 15);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Grab a random problem from whichever platform. Returns a normalized
// summary; the `id` is opaque and gets passed straight back to /import.
app.get('/api/random', async (req, res) => {
  const platform = req.query.platform || 'leetcode';
  try {
    if (platform === 'leetcode') {
      const q = await fetchRandomPublicQuestion();
      return res.json({
        platform,
        id: q.titleSlug,
        title: q.title,
        difficulty: q.difficulty,
        tags: q.topicTags.map((t) => t.name),
      });
    }
    if (platform === 'codeforces') {
      const p = await fetchRandomCodeforcesProblem();
      return res.json({
        platform,
        id: `${p.contestId}:${p.index}`,
        title: `${p.contestId}${p.index}. ${p.name}`,
        difficulty: p.difficulty,
        tags: p.rating ? [...p.tags, `rating ${p.rating}`] : p.tags,
      });
    }
    if (platform === 'hackerrank') {
      const c = await fetchRandomHackerRankChallenge();
      return res.json({
        platform,
        id: c.slug,
        title: c.name,
        difficulty: c.difficulty,
        tags: [],
      });
    }
    res.status(400).json({ error: `Unknown platform "${platform}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Topic coverage across your own solved problems, for the Analysis view.
app.get('/api/analysis', (_req, res) => {
  res.json(getTopicAnalysis(listSolvedProblems()));
});

// ---- Today's Work: a daily set of 5 real solves + a completion quiz, ----
// ---- extendable in +5 batches via "give me more" ----

app.get('/api/daily', (_req, res) => {
  try {
    res.json(getTodaysDailySet());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily/more', (_req, res) => {
  try {
    res.json(addMoreDailyCards());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/daily/complete', (req, res) => {
  try {
    res.json(completeDailyCard(req.body.slug));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/daily/quiz', async (_req, res) => {
  try {
    res.json(await getOrGenerateQuiz());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/daily/quiz/answer', (req, res) => {
  try {
    res.json(answerQuizQuestion(req.body.slug, !!req.body.correct));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Like /api/random, but biased toward important topics you haven't solved
// (or have solved the least) instead of picking uniformly at random.
app.get('/api/smart-pick', async (req, res) => {
  const platform = req.query.platform || 'leetcode';
  try {
    const solved = listSolvedProblems();
    const topic = pickWeakTopic(solved);

    if (platform === 'leetcode') {
      try {
        const q = await fetchRandomQuestionByTag(
          topic.slug,
          solved.map((p) => p.slug)
        );
        return res.json({
          platform,
          id: q.titleSlug,
          title: q.title,
          difficulty: q.difficulty,
          tags: q.topicTags.map((t) => t.name),
          topic: topic.name,
        });
      } catch {
        const q = await fetchRandomPublicQuestion();
        return res.json({
          platform,
          id: q.titleSlug,
          title: q.title,
          difficulty: q.difficulty,
          tags: q.topicTags.map((t) => t.name),
          topic: null,
        });
      }
    }

    if (platform === 'codeforces') {
      const p =
        (await fetchRandomCodeforcesProblemByTopic(topic.slug)) ?? (await fetchRandomCodeforcesProblem());
      return res.json({
        platform,
        id: `${p.contestId}:${p.index}`,
        title: `${p.contestId}${p.index}. ${p.name}`,
        difficulty: p.difficulty,
        tags: p.rating ? [...p.tags, `rating ${p.rating}`] : p.tags,
        topic: topic.name,
      });
    }

    res.status(400).json({ error: `Smart Pick isn't available for "${platform}" yet` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import a problem from any platform as a flashcard. If generateSolution is
// true and a Gemini API key is configured, a solution is written by Gemini;
// otherwise the card is created with empty code for you to fill in yourself.
app.post('/api/problems/import', async (req, res) => {
  const { platform = 'leetcode', id, generateSolution: wantSolution, language } = req.body;
  try {
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
      return res.status(400).json({ error: `Unknown platform "${platform}"` });
    }

    // Never let an import clobber a real synced solve of yours that happens
    // to share the same slug (e.g. re-importing "two-sum" for an AI answer).
    const existing = getProblem(slug);
    if (existing && existing.source === 'own') {
      return res.json(existing);
    }

    let code = '';
    let source = 'manual';
    let lang = language || 'plaintext';

    if (wantSolution) {
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

    res.json(getProblem(slug));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a fully hand-written card (paste your own question/answer from
// wherever — a book, a blog, ChatGPT, whatever).
app.post('/api/problems/manual', (req, res) => {
  const { title, difficulty, tags, contentHtml, code, lang } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  let slug = slugify(title);
  if (!slug) slug = `card-${Date.now()}`;
  let uniqueSlug = slug;
  let i = 2;
  while (slugExists(uniqueSlug)) {
    uniqueSlug = `${slug}-${i++}`;
  }

  upsertProblem({
    slug: uniqueSlug,
    questionId: null,
    title,
    difficulty: difficulty || 'Medium',
    tags: JSON.stringify(tags || []),
    contentHtml: contentHtml || '',
    sampleTestcase: '',
    exampleTestcases: '',
    code: code || '',
    lang: lang || 'plaintext',
    submissionId: null,
    submittedAt: Math.floor(Date.now() / 1000),
    syncedAt: Math.floor(Date.now() / 1000),
    source: 'manual',
    platform: 'manual',
    sourceUrl: null,
  });

  res.status(201).json(getProblem(uniqueSlug));
});

// ---- Streak tracking ----

app.post('/api/activity/ping', (_req, res) => {
  pingActivity();
  res.json(getActivity());
});

app.get('/api/activity', (_req, res) => {
  res.json(getActivity());
});

const port = process.env.PORT || 5174;
app.listen(port, '127.0.0.1', () => {
  console.log(`Server listening on http://localhost:${port}`);
});
