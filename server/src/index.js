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
} from './db.js';
import { runSync } from './sync.js';
import {
  searchPublicQuestions,
  fetchRandomPublicQuestion,
  fetchPublicQuestion,
  fetchCurrentUsername,
} from './leetcodeClient.js';
import { aiEnabled, generateSolution } from './aiGenerate.js';
import { slugify } from './util.js';
import { startBrowserLogin, getLoginState } from './browserLogin.js';

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

app.get('/api/leetcode/random', async (_req, res) => {
  try {
    const q = await fetchRandomPublicQuestion();
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import a public problem as a flashcard. If generateSolution is true and an
// Gemini API key is configured, a solution is written by Gemini; otherwise
// the card is created with empty code for you to fill in yourself.
app.post('/api/problems/import', async (req, res) => {
  const { slug, generateSolution: wantSolution, language } = req.body;
  try {
    const q = await fetchPublicQuestion(slug);
    let code = '';
    let source = 'manual';
    let lang = language || 'plaintext';

    if (wantSolution) {
      code = await generateSolution({
        title: q.title,
        contentHtml: q.content,
        difficulty: q.difficulty,
        language: language || 'Python',
      });
      source = 'ai';
      lang = language || 'Python';
    }

    upsertProblem({
      slug: q.titleSlug,
      questionId: q.questionId,
      title: q.title,
      difficulty: q.difficulty,
      tags: JSON.stringify(q.topicTags.map((t) => t.name)),
      contentHtml: q.content,
      sampleTestcase: q.sampleTestCase,
      exampleTestcases: q.exampleTestcases,
      code,
      lang,
      submissionId: null,
      submittedAt: Math.floor(Date.now() / 1000),
      syncedAt: Math.floor(Date.now() / 1000),
      source,
    });

    res.json(getProblem(q.titleSlug));
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
