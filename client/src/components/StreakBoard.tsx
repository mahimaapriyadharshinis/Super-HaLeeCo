import type { ActivityData } from '../api';

interface Props {
  activity: ActivityData | null;
}

function levelFor(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}

export default function StreakBoard({ activity }: Props) {
  if (!activity) return null;

  const today = activity.series[activity.series.length - 1];

  return (
    <div className="pixel-panel streak-board">
      <div className="streak-header">
        <span className="streak-title">STREAK</span>
        <span className="streak-numbers">
          <span className="streak-current">{activity.currentStreak}d</span>
          <span className="streak-sep">/</span>
          <span className="streak-best">best {activity.longestStreak}d</span>
        </span>
      </div>
      <div className="streak-points">{today?.points ?? 0} pts today</div>
      <div className="streak-grid">
        {activity.series.map((day) => (
          <span
            key={day.date}
            className={`streak-cell level-${levelFor(day.count)}`}
            title={`${day.date}: ${day.count} card${day.count === 1 ? '' : 's'} · ${day.points} pts`}
          />
        ))}
      </div>
    </div>
  );
}
