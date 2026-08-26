import {
  listSolvedProblems,
  createMockSession,
  getMockSession,
  finishMockSession as dbFinishMockSession,
  rateMockSessionProblem as dbRateMockSessionProblem,
  listMockSessions,
  getProblem,
} from './db.js';

function pickRandomSlugs(count) {
  const solved = [...listSolvedProblems()];
  for (let i = solved.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [solved[i], solved[j]] = [solved[j], solved[i]];
  }
  return solved.slice(0, count).map((p) => p.slug);
}

function hydrate(session) {
  if (!session) return null;
  const cards = session.slugs.map((slug) => getProblem(slug)).filter(Boolean);
  return { ...session, cards };
}

export function startMockSession(durationMinutes, count) {
  const slugs = pickRandomSlugs(count);
  if (slugs.length === 0) {
    throw new Error('No solved problems available for a mock interview yet.');
  }
  return hydrate(createMockSession(durationMinutes, slugs));
}

export function finishMockSession(id) {
  if (!getMockSession(id)) throw new Error('Mock session not found.');
  return hydrate(dbFinishMockSession(id, Date.now()));
}

export function rateMockSessionProblem(id, slug, rating) {
  const session = getMockSession(id);
  if (!session) throw new Error('Mock session not found.');
  if (!session.slugs.includes(slug)) throw new Error("That problem isn't part of this session.");
  return hydrate(dbRateMockSessionProblem(id, slug, rating));
}

export function getMockHistory(limit) {
  return listMockSessions(limit).map(hydrate);
}
