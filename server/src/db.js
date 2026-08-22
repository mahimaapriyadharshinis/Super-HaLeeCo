import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'flashcards.db');

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
    count INTEGER NOT NULL DEFAULT 0
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

export function listProblems({ difficulty, tag, q, source, platform } = {}) {
  let sql = `SELECT slug, question_id as questionId, title, difficulty, tags, lang, submitted_at as submittedAt, source, platform
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
  sql += ' ORDER BY title ASC';
  return db.prepare(sql).all(...params).map((row) => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
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
  };
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function pingActivity() {
  const date = todayStr();
  db.prepare(
    `INSERT INTO activity (date, count) VALUES (?, 1)
     ON CONFLICT(date) DO UPDATE SET count = count + 1`
  ).run(date);
}

export function getActivity(days = 140) {
  const rows = db.prepare('SELECT date, count FROM activity ORDER BY date DESC LIMIT ?').all(days);
  const byDate = new Map(rows.map((r) => [r.date, r.count]));

  // Build the full day-by-day series (including zero days) for the heatmap.
  const series = [];
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    const d = cursor.toISOString().slice(0, 10);
    series.push({ date: d, count: byDate.get(d) ?? 0 });
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
