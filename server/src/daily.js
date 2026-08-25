import {
  listSolvedProblems,
  getCardReviewMap,
  touchCardReview,
  getDailySet,
  saveDailySet,
  appendDailySlugs,
  markDailyCardComplete,
  saveDailyQuiz,
  saveDailyQuizAnswer,
  addPoints,
  todayStr,
  getProblem,
} from './db.js';
import { generateQuizQuestion } from './aiGenerate.js';

const DAILY_SIZE = 5;
const EXTRA_BATCH_SIZE = 5;
const NO_REPEAT_DAYS = 10;
const POINTS_PER_CARD = 1;
const POINTS_PER_CORRECT_ANSWER = 2;

function daysBetween(dateStr, today) {
  return Math.round((new Date(today) - new Date(dateStr)) / 86400000);
}

// Picks `count` of your real solved problems, prioritizing whichever ones
// haven't been reviewed in the longest time (never-reviewed first), and
// excluding anything in `excludeSlugs` (so a same-day "give me more" batch
// never repeats a card you've already been given today). This is what
// guarantees both "nothing repeats inside a 10-day window" and "the whole
// solved deck eventually cycles through" — a simple staleness-ordered
// rotation rather than true spaced repetition, with a little randomness
// mixed in so the order isn't perfectly predictable.
function pickDailySlugs(excludeSlugs = [], count = DAILY_SIZE) {
  const solved = listSolvedProblems().filter((p) => !excludeSlugs.includes(p.slug));
  const reviewMap = getCardReviewMap();
  const today = todayStr();

  const eligible = solved.filter((p) => {
    const last = reviewMap.get(p.slug);
    return !last || daysBetween(last, today) >= NO_REPEAT_DAYS;
  });

  // If the whole deck is smaller than the no-repeat window allows, fall back
  // to the full solved list rather than returning an empty/tiny set.
  const pool = eligible.length > 0 ? eligible : solved;

  const withStaleness = pool.map((p) => ({ slug: p.slug, last: reviewMap.get(p.slug) ?? null }));
  withStaleness.sort((a, b) => {
    if (a.last === b.last) return 0;
    if (a.last === null) return -1;
    if (b.last === null) return 1;
    return a.last < b.last ? -1 : 1;
  });

  const windowSize = Math.min(withStaleness.length, Math.max(count * 3, 20));
  const candidates = withStaleness.slice(0, windowSize);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.slice(0, count).map((c) => c.slug);
}

function hydrate(set) {
  const cards = set.slugs.map((slug) => getProblem(slug)).filter(Boolean);
  return { ...set, cards };
}

export function getTodaysDailySet() {
  const today = todayStr();
  let set = getDailySet(today);
  if (!set) {
    const slugs = pickDailySlugs();
    set = saveDailySet(today, slugs);
  }
  return hydrate(set);
}

export function addMoreDailyCards() {
  const today = todayStr();
  const existing = getDailySet(today);
  if (!existing) throw new Error("No daily set for today yet — load Today's Work first.");
  if (existing.completedSlugs.length < existing.slugs.length) {
    throw new Error("Finish today's current cards first.");
  }

  const more = pickDailySlugs(existing.slugs, EXTRA_BATCH_SIZE);
  if (more.length === 0) {
    throw new Error('No more solved problems available to add right now.');
  }

  const updated = appendDailySlugs(today, more);
  return hydrate(updated);
}

export function completeDailyCard(slug) {
  const today = todayStr();
  const existing = getDailySet(today);
  if (!existing) throw new Error("No daily set for today yet — load Today's Work first.");
  if (!existing.slugs.includes(slug)) throw new Error("That card isn't part of today's set.");

  const alreadyDone = existing.completedSlugs.includes(slug);
  const updated = markDailyCardComplete(today, slug);
  if (!alreadyDone) {
    touchCardReview(slug, today);
    addPoints(today, POINTS_PER_CARD);
  }
  return hydrate(updated);
}

export async function getOrGenerateQuiz() {
  const today = todayStr();
  const set = getDailySet(today);
  if (!set) throw new Error("No daily set for today yet — load Today's Work first.");
  if (set.completedSlugs.length < set.slugs.length) {
    throw new Error("Finish all of today's cards before starting the quiz.");
  }

  // Quiz questions accumulate across "give me more" batches within the same
  // day — only generate for slugs that don't already have a question, so an
  // earlier batch's questions (and any answers already given) are untouched.
  const existingQuiz = set.quiz ?? [];
  const covered = new Set(existingQuiz.map((q) => q.slug));
  const pending = set.slugs.filter((slug) => !covered.has(slug));
  if (pending.length === 0) return existingQuiz;

  const newItems = [];
  let lastError = null;
  for (const slug of pending) {
    const problem = getProblem(slug);
    if (!problem?.code) continue;
    try {
      const q = await generateQuizQuestion({
        title: problem.title,
        contentHtml: problem.contentHtml,
        code: problem.code,
        lang: problem.lang,
      });
      newItems.push({ slug, title: problem.title, ...q });
    } catch (err) {
      // One problem's quiz question failing shouldn't sink the whole quiz —
      // but if every single one failed (e.g. API quota exhausted), don't
      // silently save an empty quiz that reads as "already finished, 0/0".
      lastError = err;
    }
  }
  if (newItems.length === 0) {
    throw lastError ?? new Error('No quiz questions could be generated.');
  }
  const quiz = [...existingQuiz, ...newItems];
  saveDailyQuiz(today, quiz);
  return quiz;
}

export function answerQuizQuestion(slug, correct) {
  const today = todayStr();
  const before = getDailySet(today);
  if (!before) throw new Error('No daily set for today yet.');
  const alreadyAnswered = Object.prototype.hasOwnProperty.call(before.quizResults, slug);

  const updated = saveDailyQuizAnswer(today, slug, correct);
  if (!alreadyAnswered && correct) addPoints(today, POINTS_PER_CORRECT_ANSWER);
  return hydrate(updated);
}
