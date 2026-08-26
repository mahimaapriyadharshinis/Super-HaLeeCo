import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.HALEECO_DB_PATH || path.join(__dirname, '..', 'flashcards.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS problems (
    slug TEXT PRIMARY KEY,
    question_id TEXT,
    title TEXT NOT NULL,
    difficulty TEXT,
    tags TEXT,
    content_html TEXT,
    sample_testcase TEXT,
    example_testcases TEXT,
    code TEXT,
    lang TEXT,
    submission_id TEXT,
    submitted_at INTEGER,
    synced_at INTEGER,
    source TEXT NOT NULL DEFAULT 'own',
    platform TEXT NOT NULL DEFAULT 'leetcode',
    source_url TEXT
  );

  CREATE TABLE IF NOT EXISTS activity (
    date TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS card_reviews (
    slug TEXT PRIMARY KEY,
    last_reviewed_at TEXT,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    due_date TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_sets (
    date TEXT PRIMARY KEY,
    slugs TEXT NOT NULL,
    completed_slugs TEXT NOT NULL DEFAULT '[]',
    quiz TEXT,
    quiz_results TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS mock_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_minutes INTEGER NOT NULL,
    slugs TEXT NOT NULL,
    ratings TEXT NOT NULL DEFAULT '{}'
  );
`);

const problemColumns = db.prepare("PRAGMA table_info(problems)").all().map((c) => c.name);
if (!problemColumns.includes('source')) {
  db.exec("ALTER TABLE problems ADD COLUMN source TEXT NOT NULL DEFAULT 'own'");
}
if (!problemColumns.includes('platform')) {
  db.exec("ALTER TABLE problems ADD COLUMN platform TEXT NOT NULL DEFAULT 'leetcode'");
}
if (!problemColumns.includes('source_url')) {
  db.exec('ALTER TABLE problems ADD COLUMN source_url TEXT');
  db.exec(
    "UPDATE problems SET source_url = 'https://leetcode.com/problems/' || slug || '/' WHERE platform = 'leetcode' AND question_id IS NOT NULL"
  );
}
if (!problemColumns.includes('companies')) {
  db.exec("ALTER TABLE problems ADD COLUMN companies TEXT NOT NULL DEFAULT '[]'");
}

const activityColumns = db.prepare('PRAGMA table_info(activity)').all().map((c) => c.name);
if (!activityColumns.includes('points')) {
  db.exec('ALTER TABLE activity ADD COLUMN points INTEGER NOT NULL DEFAULT 0');
}

const cardReviewColumns = db.prepare('PRAGMA table_info(card_reviews)').all().map((c) => c.name);
for (const [col, ddl] of [
  ['ease_factor', 'ALTER TABLE card_reviews ADD COLUMN ease_factor REAL NOT NULL DEFAULT 2.5'],
  ['interval_days', 'ALTER TABLE card_reviews ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0'],
  ['reps', 'ALTER TABLE card_reviews ADD COLUMN reps INTEGER NOT NULL DEFAULT 0'],
  ['due_date', 'ALTER TABLE card_reviews ADD COLUMN due_date TEXT'],
]) {
  if (!cardReviewColumns.includes(col)) db.exec(ddl);
}

export function upsertProblem(problem) {
  const stmt = db.prepare(`
    INSERT INTO problems (
      slug, question_id, title, difficulty, tags, content_html,
      sample_testcase, example_testcases, code, lang,
      submission_id, submitted_at, synced_at, source, platform, source_url
    ) VALUES (
      @slug, @questionId, @title, @difficulty, @tags, @contentHtml,
      @sampleTestcase, @exampleTestcases, @code, @lang,
      @submissionId, @submittedAt, @syncedAt, @source, @platform, @sourceUrl
    )
    ON CONFLICT(slug) DO UPDATE SET
      question_id = excluded.question_id,
      title = excluded.title,
      difficulty = excluded.difficulty,
      tags = excluded.tags,
      content_html = excluded.content_html,
      sample_testcase = excluded.sample_testcase,
      example_testcases = excluded.example_testcases,
      code = excluded.code,
      lang = excluded.lang,
      submission_id = excluded.submission_id,
      submitted_at = excluded.submitted_at,
      synced_at = excluded.synced_at,
      source = excluded.source,
      platform = excluded.platform,
      source_url = excluded.source_url
  `);
  stmt.run({ source: 'own', submissionId: null, platform: 'leetcode', sourceUrl: null, ...problem });
}

export function updateProblemFields(slug, fields) {
  const allowed = ['title', 'difficulty', 'tags', 'contentHtml', 'code', 'lang'];
  const colMap = {
    title: 'title',
    difficulty: 'difficulty',
    tags: 'tags',
    contentHtml: 'content_html',
    code: 'code',
    lang: 'lang',
  };
  const sets = [];
  const params = {};
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${colMap[key]} = @${key}`);
    params[key] = key === 'tags' ? JSON.stringify(fields[key]) : fields[key];
  }
  if (sets.length === 0) return;
  params.slug = slug;
  db.prepare(`UPDATE problems SET ${sets.join(', ')} WHERE slug = @slug`).run(params);
}

export function deleteProblem(slug) {
  db.prepare('DELETE FROM problems WHERE slug = ?').run(slug);
}

export function getSubmissionIdForSlug(slug) {
  const row = db.prepare('SELECT submission_id FROM problems WHERE slug = ?').get(slug);
  return row?.submission_id ?? null;
}

export function slugExists(slug) {
  return !!db.prepare('SELECT 1 FROM problems WHERE slug = ?').get(slug);
}

export function listProblems({ difficulty, tag, q, source, platform, company } = {}) {
  let sql = `SELECT slug, question_id as questionId, title, difficulty, tags, lang, submitted_at as submittedAt, source, platform, companies
             FROM problems WHERE 1=1`;
  const params = [];
  if (difficulty) {
    sql += ' AND difficulty = ?';
    params.push(difficulty);
  }
  if (tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%"${tag}"%`);
  }
  if (q) {
    sql += ' AND title LIKE ?';
    params.push(`%${q}%`);
  }
  if (source === 'own') {
    sql += " AND source = 'own'";
  } else if (source === 'public') {
    sql += " AND source != 'own'";
  }
  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }
  if (company) {
    sql += ' AND companies LIKE ?';
    params.push(`%"${company}"%`);
  }
  sql += ' ORDER BY title ASC';
  return db.prepare(sql).all(...params).map((row) => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    companies: JSON.parse(row.companies || '[]'),
  }));
}

export function getProblem(slug) {
  const row = db.prepare('SELECT * FROM problems WHERE slug = ?').get(slug);
  if (!row) return null;
  return {
    slug: row.slug,
    questionId: row.question_id,
    title: row.title,
    difficulty: row.difficulty,
    tags: JSON.parse(row.tags || '[]'),
    contentHtml: row.content_html,
    sampleTestcase: row.sample_testcase,
    exampleTestcases: row.example_testcases,
    code: row.code,
    lang: row.lang,
    submittedAt: row.submitted_at,
    syncedAt: row.synced_at,
    source: row.source,
    platform: row.platform,
    sourceUrl: row.source_url,
    companies: JSON.parse(row.companies || '[]'),
  };
}

export function setProblemCompanies(slug, companies) {
  db.prepare('UPDATE problems SET companies = ? WHERE slug = ?').run(JSON.stringify(companies), slug);
}

export function getAllLeetCodeSlugs() {
  return db
    .prepare("SELECT slug FROM problems WHERE platform = 'leetcode'")
    .all()
    .map((r) => r.slug);
}

export function listAllCompanies() {
  const rows = db.prepare("SELECT companies FROM problems WHERE companies != '[]'").all();
  const set = new Set();
  for (const row of rows) {
    for (const c of JSON.parse(row.companies || '[]')) set.add(c);
  }
  return [...set].sort();
}

export function listSolvedProblems() {
  const rows = db.prepare("SELECT slug, tags FROM problems WHERE source = 'own'").all();
  return rows.map((row) => ({ slug: row.slug, tags: JSON.parse(row.tags || '[]') }));
}

export function allTags() {
  const rows = db.prepare('SELECT tags FROM problems').all();
  const set = new Set();
  for (const row of rows) {
    for (const t of JSON.parse(row.tags || '[]')) set.add(t);
  }
  return [...set].sort();
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function pingActivity() {
  const date = todayStr();
  db.prepare(
    `INSERT INTO activity (date, count) VALUES (?, 1)
     ON CONFLICT(date) DO UPDATE SET count = count + 1`
  ).run(date);
}

export function addPoints(date, amount) {
  db.prepare(
    `INSERT INTO activity (date, count, points) VALUES (?, 0, ?)
     ON CONFLICT(date) DO UPDATE SET points = points + excluded.points`
  ).run(date, amount);
}

export function getActivity(days = 140) {
  const rows = db.prepare('SELECT date, count, points FROM activity ORDER BY date DESC LIMIT ?').all(days);
  const byDate = new Map(rows.map((r) => [r.date, { count: r.count, points: r.points }]));

  // Build the full day-by-day series (including zero days) for the heatmap.
  const series = [];
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    const d = cursor.toISOString().slice(0, 10);
    const entry = byDate.get(d);
    series.push({ date: d, count: entry?.count ?? 0, points: entry?.points ?? 0 });
    cursor.setDate(cursor.getDate() - 1);
  }
  series.reverse();

  let currentStreak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].count > 0) currentStreak++;
    else break;
  }
  // If today has no activity yet, don't zero out yesterday's ongoing streak.
  if (currentStreak === 0 && series.length > 1 && series[series.length - 1].count === 0) {
    let i = series.length - 2;
    while (i >= 0 && series[i].count > 0) {
      currentStreak++;
      i--;
    }
  }

  let longestStreak = 0;
  let running = 0;
  for (const day of series) {
    if (day.count > 0) {
      running++;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }

  return { series, currentStreak, longestStreak };
}

// ---- Card review / SM-2 spaced-repetition state (drives Today's Work rotation) ----

export function getCardSrsMap() {
  const rows = db
    .prepare('SELECT slug, last_reviewed_at, ease_factor, interval_days, reps, due_date FROM card_reviews')
    .all();
  return new Map(
    rows.map((r) => [
      r.slug,
      {
        lastReviewedAt: r.last_reviewed_at,
        easeFactor: r.ease_factor,
        intervalDays: r.interval_days,
        reps: r.reps,
        dueDate: r.due_date,
      },
    ])
  );
}

export function updateCardSrs(slug, srs, date) {
  db.prepare(
    `INSERT INTO card_reviews (slug, last_reviewed_at, ease_factor, interval_days, reps, due_date)
     VALUES (@slug, @date, @easeFactor, @intervalDays, @reps, @dueDate)
     ON CONFLICT(slug) DO UPDATE SET
       last_reviewed_at = excluded.last_reviewed_at,
       ease_factor = excluded.ease_factor,
       interval_days = excluded.interval_days,
       reps = excluded.reps,
       due_date = excluded.due_date`
  ).run({ slug, date, ...srs });
}

// ---- Today's Work ----

export function getDailySet(date) {
  const row = db.prepare('SELECT * FROM daily_sets WHERE date = ?').get(date);
  if (!row) return null;
  return {
    date: row.date,
    slugs: JSON.parse(row.slugs),
    completedSlugs: JSON.parse(row.completed_slugs),
    quiz: row.quiz ? JSON.parse(row.quiz) : null,
    quizResults: JSON.parse(row.quiz_results),
  };
}

export function saveDailySet(date, slugs) {
  db.prepare(
    `INSERT INTO daily_sets (date, slugs, completed_slugs, quiz, quiz_results)
     VALUES (?, ?, '[]', NULL, '{}')
     ON CONFLICT(date) DO NOTHING`
  ).run(date, JSON.stringify(slugs));
  return getDailySet(date);
}

export function appendDailySlugs(date, newSlugs) {
  const set = getDailySet(date);
  if (!set) return null;
  const merged = [...set.slugs, ...newSlugs];
  db.prepare('UPDATE daily_sets SET slugs = ? WHERE date = ?').run(JSON.stringify(merged), date);
  return getDailySet(date);
}

export function markDailyCardComplete(date, slug) {
  const set = getDailySet(date);
  if (!set) return null;
  if (!set.completedSlugs.includes(slug)) {
    set.completedSlugs.push(slug);
    db.prepare('UPDATE daily_sets SET completed_slugs = ? WHERE date = ?').run(
      JSON.stringify(set.completedSlugs),
      date
    );
  }
  return getDailySet(date);
}

export function saveDailyQuiz(date, quiz) {
  db.prepare('UPDATE daily_sets SET quiz = ? WHERE date = ?').run(JSON.stringify(quiz), date);
}

export function saveDailyQuizAnswer(date, slug, correct) {
  const set = getDailySet(date);
  if (!set) return null;
  set.quizResults[slug] = correct;
  db.prepare('UPDATE daily_sets SET quiz_results = ? WHERE date = ?').run(
    JSON.stringify(set.quizResults),
    date
  );
  return getDailySet(date);
}

// ---- Mock interview sessions ----

function hydrateMockSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMinutes: row.duration_minutes,
    slugs: JSON.parse(row.slugs),
    ratings: JSON.parse(row.ratings),
  };
}

export function createMockSession(durationMinutes, slugs) {
  const info = db
    .prepare('INSERT INTO mock_sessions (started_at, duration_minutes, slugs) VALUES (?, ?, ?)')
    .run(Date.now(), durationMinutes, JSON.stringify(slugs));
  return getMockSession(info.lastInsertRowid);
}

export function getMockSession(id) {
  return hydrateMockSession(db.prepare('SELECT * FROM mock_sessions WHERE id = ?').get(id));
}

export function finishMockSession(id, endedAt) {
  db.prepare('UPDATE mock_sessions SET ended_at = ? WHERE id = ?').run(endedAt, id);
  return getMockSession(id);
}

export function rateMockSessionProblem(id, slug, rating) {
  const session = getMockSession(id);
  if (!session) return null;
  session.ratings[slug] = rating;
  db.prepare('UPDATE mock_sessions SET ratings = ? WHERE id = ?').run(
    JSON.stringify(session.ratings),
    id
  );
  return getMockSession(id);
}

export function listMockSessions(limit = 20) {
  return db
    .prepare('SELECT * FROM mock_sessions ORDER BY started_at DESC LIMIT ?')
    .all(limit)
    .map(hydrateMockSession);
}

// ---- Export / import ----

export function exportAllProblems() {
  return db
    .prepare('SELECT * FROM problems')
    .all()
    .map((row) => ({
      slug: row.slug,
      questionId: row.question_id,
      title: row.title,
      difficulty: row.difficulty,
      tags: JSON.parse(row.tags || '[]'),
      contentHtml: row.content_html,
      sampleTestcase: row.sample_testcase,
      exampleTestcases: row.example_testcases,
      code: row.code,
      lang: row.lang,
      submittedAt: row.submitted_at,
      syncedAt: row.synced_at,
      source: row.source,
      platform: row.platform,
      sourceUrl: row.source_url,
      companies: JSON.parse(row.companies || '[]'),
    }));
}
