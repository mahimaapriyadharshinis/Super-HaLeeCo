import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import {
  fetchDailySet,
  addMoreDailyCards,
  completeDailyCard,
  fetchDailyQuiz,
  answerDailyQuiz,
} from '../api';
import type { DailySet, ProblemDetail, QuizItem } from '../api';

const LANG_ALIASES: Record<string, string> = {
  python3: 'python',
  python: 'python',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  java: 'java',
  javascript: 'javascript',
  typescript: 'typescript',
  csharp: 'csharp',
  'c#': 'csharp',
  golang: 'go',
  go: 'go',
  kotlin: 'kotlin',
  swift: 'swift',
  rust: 'rust',
  ruby: 'ruby',
  scala: 'scala',
  php: 'php',
};

function DailyCard({
  problem,
  onDone,
}: {
  problem: ProblemDetail;
  onDone: () => void;
}) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => setFlipped(false), [problem.slug]);

  const cleanHtml = useMemo(
    () => DOMPurify.sanitize(problem.contentHtml || ''),
    [problem.contentHtml]
  );

  const highlighted = useMemo(() => {
    const lang = LANG_ALIASES[problem.lang?.toLowerCase() ?? ''] ?? undefined;
    try {
      const result = lang
        ? hljs.highlight(problem.code || '', { language: lang })
        : hljs.highlightAuto(problem.code || '');
      return result.value;
    } catch {
      return problem.code || '';
    }
  }, [problem.code, problem.lang]);

  return (
    <div className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
      <div className="flashcard-inner">
        <div className="flashcard-face flashcard-front">
          <div className="card-header">
            <span className={`difficulty-badge difficulty-${problem.difficulty?.toLowerCase()}`}>
              {problem.difficulty}
            </span>
            <h2>
              {problem.questionId ? `${problem.questionId}. ` : ''}
              {problem.title}
            </h2>
          </div>
          <div className="tag-row">
            {problem.tags.map((t) => (
              <span key={t} className="tag-chip">
                {t}
              </span>
            ))}
          </div>
          <div className="problem-content" dangerouslySetInnerHTML={{ __html: cleanHtml }} />
          <div className="flip-hint">Click card or press space to reveal the code →</div>
        </div>

        <div className="flashcard-face flashcard-back">
          <div className="card-header">
            <h2>
              {problem.questionId ? `${problem.questionId}. ` : ''}
              {problem.title}
            </h2>
            <span className="lang-badge">{problem.lang}</span>
          </div>
          {problem.code ? (
            <pre className="code-block">
              <code
                className={`hljs language-${problem.lang}`}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </pre>
          ) : (
            <div className="code-block empty-code">No solution saved yet.</div>
          )}
          <div className="back-actions">
            <button
              className="pixel-btn accent"
              onClick={(e) => {
                e.stopPropagation();
                onDone();
              }}
            >
              Mark done → next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DailyWork() {
  const [dailySet, setDailySet] = useState<DailySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quizLoading, setQuizLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingSet, setPendingSet] = useState<DailySet | null>(null);

  const quiz = dailySet?.quiz ?? [];
  const quizCoveredSlugs = new Set(quiz.map((q) => q.slug));
  const pendingQuizSlugs = dailySet
    ? dailySet.completedSlugs.filter((slug) => !quizCoveredSlugs.has(slug))
    : [];
  const quizIndex = quiz.findIndex((q) => dailySet?.quizResults[q.slug] === undefined);

  useEffect(() => {
    setSelected(null);
    setPendingSet(null);
  }, [quizIndex]);

  useEffect(() => {
    fetchDailySet()
      .then(setDailySet)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCardDone(slug: string) {
    try {
      const updated = await completeDailyCard(slug);
      setDailySet(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark card complete');
    }
  }

  async function handleStartQuiz() {
    setQuizLoading(true);
    setError('');
    try {
      const quiz = await fetchDailyQuiz();
      setDailySet((prev) => (prev ? { ...prev, quiz } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate quiz');
    } finally {
      setQuizLoading(false);
    }
  }

  async function handleSelectOption(item: QuizItem, index: number) {
    if (selected !== null) return;
    setSelected(index);
    try {
      const updated = await answerDailyQuiz(item.slug, index === item.correctIndex);
      setPendingSet(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record answer');
    }
  }

  function handleNextQuestion() {
    if (pendingSet) setDailySet(pendingSet);
  }

  async function handleGiveMeMore() {
    setMoreLoading(true);
    setError('');
    try {
      const updated = await addMoreDailyCards();
      setDailySet(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add more cards');
    } finally {
      setMoreLoading(false);
    }
  }

  if (loading) return <div className="empty-main">Loading today's work…</div>;
  if (error && !dailySet) return <div className="empty-main">{error}</div>;
  if (!dailySet) return null;

  const remaining = dailySet.cards.filter((c) => !dailySet.completedSlugs.includes(c.slug));
  const cardsDone = dailySet.completedSlugs.length >= dailySet.slugs.length && dailySet.slugs.length > 0;

  if (dailySet.slugs.length === 0) {
    return (
      <div className="empty-main">
        <p>No solved problems yet to build today's set from.</p>
        <p>Sync or add some cards first, then come back for Today's Work.</p>
      </div>
    );
  }

  return (
    <div className="daily-work">
      <div className="daily-progress pixel-panel">
        <span className="daily-progress-label">TODAY'S WORK</span>
        <span className="daily-progress-count">
          {dailySet.completedSlugs.length} / {dailySet.slugs.length} cards
          {quiz.length > 0 && (
            <>
              {' '}
              · quiz {Object.keys(dailySet.quizResults).length} / {quiz.length}
            </>
          )}
        </span>
      </div>

      {error && <div className="login-message login-error">{error}</div>}

      {!cardsDone && remaining[0] && (
        <DailyCard problem={remaining[0]} onDone={() => handleCardDone(remaining[0].slug)} />
      )}

      {cardsDone && pendingQuizSlugs.length > 0 && (
        <div className="pixel-panel daily-summary">
          <p>All {dailySet.slugs.length} cards done for today.</p>
          <p>Next: a hard quiz on the algorithm and code behind each one.</p>
          <button className="pixel-btn accent" onClick={handleStartQuiz} disabled={quizLoading}>
            {quizLoading ? 'Generating quiz…' : 'Start quiz'}
          </button>
        </div>
      )}

      {cardsDone && pendingQuizSlugs.length === 0 && quizIndex !== -1 && (
        <div className="pixel-panel quiz-box">
          <div className="quiz-header">
            <span>
              Question {quizIndex + 1} / {quiz.length}
            </span>
            <span className="lang-badge">{quiz[quizIndex].title}</span>
          </div>
          <p className="quiz-question">{quiz[quizIndex].question}</p>
          <div className="quiz-options">
            {quiz[quizIndex].options.map((option, i) => {
              const item = quiz[quizIndex];
              let cls = 'quiz-option';
              if (selected !== null) {
                if (i === item.correctIndex) cls += ' correct';
                else if (i === selected) cls += ' incorrect';
              }
              return (
                <button
                  key={i}
                  className={cls}
                  disabled={selected !== null}
                  onClick={() => handleSelectOption(item, i)}
                >
                  <span className="quiz-option-letter">{String.fromCharCode(65 + i)}</span>
                  {option}
                </button>
              );
            })}
          </div>
          {selected !== null && (
            <>
              <p className="quiz-answer">{quiz[quizIndex].explanation}</p>
              <button className="pixel-btn accent" onClick={handleNextQuestion} disabled={!pendingSet}>
                {pendingSet ? 'Next question' : 'Saving…'}
              </button>
            </>
          )}
        </div>
      )}

      {cardsDone && pendingQuizSlugs.length === 0 && quizIndex === -1 && quiz.length > 0 && (
        <div className="pixel-panel daily-summary">
          <p>Today's work is complete.</p>
          <p>
            {Object.values(dailySet.quizResults).filter(Boolean).length} / {quiz.length} quiz
            questions correct.
          </p>
          <button className="pixel-btn accent" onClick={handleGiveMeMore} disabled={moreLoading}>
            {moreLoading ? 'Fetching more…' : 'Give me more (+5)'}
          </button>
          <p className="daily-summary-hint">Or come back tomorrow for a fresh 5 — nothing repeats within 10 days.</p>
        </div>
      )}
    </div>
  );
}
