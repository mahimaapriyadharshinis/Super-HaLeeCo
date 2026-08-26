import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DailyWork from '../src/components/DailyWork';
import * as api from '../src/api';
import type { DailySet, ProblemDetail } from '../src/api';

vi.mock('../src/api');

function buildProblem(slug: string, title: string): ProblemDetail {
  return {
    slug,
    questionId: '1',
    title,
    difficulty: 'Easy',
    tags: ['Array'],
    lang: 'python3',
    submittedAt: 0,
    source: 'own',
    platform: 'leetcode',
    contentHtml: `<p>Solve: ${title}</p>`,
    sampleTestcase: '',
    exampleTestcases: '',
    code: 'print(1)',
    syncedAt: 0,
    sourceUrl: 'https://leetcode.com/problems/' + slug,
  };
}

function buildSet(overrides: Partial<DailySet> = {}): DailySet {
  const cards = [buildProblem('a', 'Problem A'), buildProblem('b', 'Problem B')];
  return {
    date: '2026-08-25',
    slugs: cards.map((c) => c.slug),
    completedSlugs: [],
    quiz: null,
    quizResults: {},
    cards,
    ...overrides,
  };
}

describe('DailyWork', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows the first uncompleted card once loaded', async () => {
    vi.mocked(api.fetchDailySet).mockResolvedValue(buildSet());
    render(<DailyWork />);

    expect(await screen.findByText('Solve: Problem A')).toBeInTheDocument();
  });

  it('marks a card done and advances to the next one', async () => {
    vi.mocked(api.fetchDailySet).mockResolvedValue(buildSet());
    vi.mocked(api.completeDailyCard).mockResolvedValue(buildSet({ completedSlugs: ['a'] }));
    render(<DailyWork />);

    await screen.findByText('Solve: Problem A');
    fireEvent.click(screen.getByText('Mark done → next'));

    await waitFor(() => expect(api.completeDailyCard).toHaveBeenCalledWith('a'));
    expect(await screen.findByText('Solve: Problem B')).toBeInTheDocument();
  });

  it('offers to start the quiz once every card is completed', async () => {
    vi.mocked(api.fetchDailySet).mockResolvedValue(
      buildSet({ completedSlugs: ['a', 'b'] })
    );
    render(<DailyWork />);

    expect(await screen.findByText('Start quiz')).toBeInTheDocument();
  });

  it('shows an empty-deck message when there are no solved problems yet', async () => {
    vi.mocked(api.fetchDailySet).mockResolvedValue(
      buildSet({ slugs: [], completedSlugs: [], cards: [] })
    );
    render(<DailyWork />);

    expect(await screen.findByText(/No solved problems yet/)).toBeInTheDocument();
  });
});
