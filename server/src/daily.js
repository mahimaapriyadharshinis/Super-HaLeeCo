import {
  listSolvedProblems,
  getCardSrsMap,
  updateCardSrs,
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
import { applySm2 } from './srs.js';

const DAILY_SIZE = 5;
const EXTRA_BATCH_SIZE = 5;
const POINTS_PER_CARD = 1;
const POINTS_PER_CORRECT_ANSWER = 2;

// Picks `count` of your real solved problems for review, using SM-2 due
// dates: cards that are due (or have never been reviewed) come first,
// ordered most-overdue-first; if fewer than `count` are actually due yet,
// the remainder is filled from whatever's soonest-due so Today's Work always
// has a full set to work through. `excludeSlugs` keeps a same-day "give me
// more" batch from repeating a card already handed out today.
function pickDailySlugs(excludeSlugs = [], count = DAILY_SIZE) {
  const solved = listSolvedProblems().filter((p) => !excludeSlugs.includes(p.slug));
  const srsMap = getCardSrsMap();
  const today = todayStr();

  const withDueDate = solved.map((p) => ({ slug: p.slug, dueDate: srsMap.get(p.slug)?.dueDate ?? null }));
  withDueDate.sort((a, b) => {
    if (a.dueDate === b.dueDate) return 0;
    if (a.dueDate === null) return -1;
    if (b.dueDate === null) return 1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });

  const due = withDueDate.filter((p) => p.dueDate === null || p.dueDate <= today);
  const notYetDue = withDueDate.filter((p) => p.dueDate !== null && p.dueDate > today);

  // Shuffle within the due pool so the order isn't perfectly predictable,
  // then top up with the soonest not-yet-due cards if the deck doesn't have
  // enough due today.
  for (let i = due.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [due[i], due[j]] = [due[j], due[i]];
  }

  return [...due, ...notYetDue].slice(0, count).map((c) => c.slug);
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
    addPoints(today, POINTS_PER_CARD);
    // Cards with no saved code never get a quiz question (nothing to ask
    // about), so their SM-2 schedule would otherwise never advance past
    // "always due". Bump it here as a neutral pass; everything else gets
    // scheduled by its actual quiz answer in answerQuizQuestion instead.
    const problem = getProblem(slug);
    if (!problem?.code) {
      const srsMap = getCardSrsMap();
      updateCardSrs(slug, applySm2(srsMap.get(slug), true, today), today);
    }
  }
  return hydrate(updated);
}

export async function getOrGenerateQuiz(apiKey) {
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
        apiKey,
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
  if (!alreadyAnswered) {
    if (correct) addPoints(today, POINTS_PER_CORRECT_ANSWER);
    const srsMap = getCardSrsMap();
    updateCardSrs(slug, applySm2(srsMap.get(slug), correct, today), today);
  }
  return hydrate(updated);
}
