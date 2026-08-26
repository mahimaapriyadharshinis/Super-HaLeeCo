import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';

process.env.HALEECO_DB_PATH = path.join(
  os.tmpdir(),
  `haleeco-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);

vi.mock('../src/aiGenerate.js', () => ({
  generateQuizQuestion: vi.fn(async ({ title }) => ({
    question: `stub question about ${title}`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'stub explanation',
  })),
}));

const db = await import('../src/db.js');
const daily = await import('../src/daily.js');

function seedSolved(slug, title) {
  db.upsertProblem({
    slug,
    questionId: '1',
    title,
    difficulty: 'Easy',
    tags: JSON.stringify(['Array']),
    contentHtml: '<p>desc</p>',
    sampleTestcase: '',
    exampleTestcases: '',
    code: 'print(1)',
    lang: 'python3',
    submittedAt: Date.now(),
    syncedAt: Date.now(),
    source: 'own',
  });
}

function resetAll() {
  db.db.exec('DELETE FROM problems; DELETE FROM daily_sets; DELETE FROM card_reviews; DELETE FROM activity;');
}

describe('getTodaysDailySet', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetAll();
    for (let i = 0; i < 8; i++) seedSolved(`problem-${i}`, `Problem ${i}`);
  });

  it('returns exactly 5 cards for a fresh day', () => {
    const set = daily.getTodaysDailySet();
    expect(set.slugs.length).toBe(5);
    expect(set.cards.length).toBe(5);
  });

  it('returns the same set on a second call the same day', () => {
    const first = daily.getTodaysDailySet();
    const second = daily.getTodaysDailySet();
    expect(second.slugs).toEqual(first.slugs);
  });
});

describe('addMoreDailyCards', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetAll();
    for (let i = 0; i < 8; i++) seedSolved(`problem-${i}`, `Problem ${i}`);
  });

  it('throws before the current batch is completed', () => {
    daily.getTodaysDailySet();
    expect(() => daily.addMoreDailyCards()).toThrow(/finish/i);
  });

  it('appends more cards without repeating ones already given today', () => {
    const first = daily.getTodaysDailySet();
    for (const slug of first.slugs) daily.completeDailyCard(slug);

    const more = daily.addMoreDailyCards();
    const firstBatch = more.slugs.slice(0, 5);
    const secondBatch = more.slugs.slice(5);
    expect(secondBatch.length).toBeGreaterThan(0);
    expect(secondBatch.some((s) => firstBatch.includes(s))).toBe(false);
  });

  it('errors once the whole solved deck has been handed out for the day', () => {
    const first = daily.getTodaysDailySet();
    for (const slug of first.slugs) daily.completeDailyCard(slug);
    const more = daily.addMoreDailyCards();
    for (const slug of more.slugs.slice(5)) daily.completeDailyCard(slug);

    expect(() => daily.addMoreDailyCards()).toThrow(/no more solved problems/i);
  });
});

describe('quiz flow and points', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetAll();
    for (let i = 0; i < 5; i++) seedSolved(`problem-${i}`, `Problem ${i}`);
  });

  it('awards a point per completed card and 2 points per correct quiz answer, exactly once each', async () => {
    const set = daily.getTodaysDailySet();
    for (const slug of set.slugs) daily.completeDailyCard(slug);
    // Repeating a completion shouldn't double-award.
    daily.completeDailyCard(set.slugs[0]);

    const quiz = await daily.getOrGenerateQuiz();
    expect(quiz.length).toBe(5);

    daily.answerQuizQuestion(quiz[0].slug, true);
    // Repeating an answer shouldn't double-award either.
    daily.answerQuizQuestion(quiz[0].slug, true);
    daily.answerQuizQuestion(quiz[1].slug, false);

    const activity = db.getActivity(1);
    const today = activity.series[activity.series.length - 1];
    // 5 cards * 1pt + 1 correct answer * 2pt = 7
    expect(today.points).toBe(7);
  });
});

describe('SM-2 rotation over multiple days', () => {
  beforeEach(() => {
    resetAll();
    for (let i = 0; i < 5; i++) seedSolved(`problem-${i}`, `Problem ${i}`);
  });

  it('keeps offering a full daily set even once every card has a future due date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

    let set = daily.getTodaysDailySet();
    expect(set.slugs.length).toBe(5);
    for (const slug of set.slugs) daily.completeDailyCard(slug);
    const quiz = await daily.getOrGenerateQuiz();
    for (const q of quiz) daily.answerQuizQuestion(q.slug, true);

    // First correct rep -> 1-day interval. The very next day it's due again.
    vi.setSystemTime(new Date('2026-03-02T12:00:00Z'));
    set = daily.getTodaysDailySet();
    expect(set.slugs.length).toBe(5);
    for (const slug of set.slugs) daily.completeDailyCard(slug);
    const quiz2 = await daily.getOrGenerateQuiz();
    for (const q of quiz2) daily.answerQuizQuestion(q.slug, true);

    // Second correct rep -> 6-day interval, due 2026-03-08. With only 5
    // cards total and none due, pickDailySlugs should still fall back to a
    // full 5-card set instead of coming up short.
    vi.setSystemTime(new Date('2026-03-03T12:00:00Z'));
    set = daily.getTodaysDailySet();
    expect(set.slugs.length).toBe(5);

    vi.useRealTimers();
  });
});
