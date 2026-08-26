// Minimal SM-2 (SuperMemo 2) spaced-repetition scheduler. Quality is
// collapsed to a binary signal — correct/incorrect on the per-card quiz
// question — rather than the classic 0-5 self-rated scale, since that's the
// only graded signal Today's Work actually has.
export const DEFAULT_SRS = { easeFactor: 2.5, intervalDays: 0, reps: 0, dueDate: null };

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applySm2(current, correct, today) {
  const easeFactor0 = current?.easeFactor ?? DEFAULT_SRS.easeFactor;
  const reps0 = current?.reps ?? 0;
  const prevInterval = current?.intervalDays ?? 0;
  // 5 ("perfect response") vs 2 ("incorrect, but the material felt familiar")
  // rather than a midpoint value — quality 4 sits exactly at SM-2's neutral
  // point where the ease factor never moves, which would mean consistently
  // correct answers could never earn a longer interval over time.
  const quality = correct ? 5 : 2;

  let reps;
  let intervalDays;
  if (quality < 3) {
    reps = 0;
    intervalDays = 1;
  } else {
    reps = reps0 + 1;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 6;
    else intervalDays = Math.round((prevInterval || 6) * easeFactor0);
  }

  const easeFactor = Math.max(
    1.3,
    easeFactor0 + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    reps,
    dueDate: addDays(today, intervalDays),
  };
}
