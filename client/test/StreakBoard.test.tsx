import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StreakBoard from '../src/components/StreakBoard';
import type { ActivityData } from '../src/api';

function buildActivity(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    series: [
      { date: '2026-08-24', count: 2, points: 5 },
      { date: '2026-08-25', count: 3, points: 12 },
    ],
    currentStreak: 2,
    longestStreak: 4,
    ...overrides,
  };
}

describe('StreakBoard', () => {
  it('renders nothing when there is no activity yet', () => {
    const { container } = render(<StreakBoard activity={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current and best streak', () => {
    render(<StreakBoard activity={buildActivity()} />);
    expect(screen.getByText('2d')).toBeInTheDocument();
    expect(screen.getByText(/best 4d/)).toBeInTheDocument();
  });

  it("shows today's points from the last entry in the series", () => {
    render(<StreakBoard activity={buildActivity()} />);
    expect(screen.getByText('12 pts today')).toBeInTheDocument();
  });

  it('shows 0 points today when the series is empty', () => {
    render(<StreakBoard activity={buildActivity({ series: [] })} />);
    expect(screen.getByText('0 pts today')).toBeInTheDocument();
  });
});
