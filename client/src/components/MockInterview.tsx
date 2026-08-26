import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import {
  startMockSession,
  finishMockSession,
  rateMockSessionProblem,
  fetchMockHistory,
} from '../api';
import type { MockSession } from '../api';

const LANG_ALIASES: Record<string, string> = {
  python3: 'python',
  python: 'python',
  cpp: 'cpp',
  'c++': 'cpp',
  java: 'java',
  javascript: 'javascript',
  typescript: 'typescript',
};

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function averageRating(session: MockSession) {
  const values = Object.values(session.ratings);
  if (values.length === 0) return null;
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
}

export default function MockInterview() {
  const [history, setHistory] = useState<MockSession[] | null>(null);
  const [session, setSession] = useState<MockSession | null>(null);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [duration, setDuration] = useState(30);
  const [count, setCount] = useState(2);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchMockHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

  const timedUp = !!session && !session.endedAt;

  useEffect(() => {
    if (!timedUp) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timedUp]);

  const remainingMs = session ? session.startedAt + session.durationMinutes * 60000 - now : 0;

  useEffect(() => {
    if (timedUp && remainingMs <= 0) {
      handleFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedUp, remainingMs <= 0]);

  async function handleStart() {
    setStarting(true);
    setError('');
    try {
      const s = await startMockSession(duration, count);
      setSession(s);
      setIndex(0);
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setStarting(false);
    }
  }

  async function handleFinish() {
    if (!session) return;
    try {
      const s = await finishMockSession(session.id);
      setSession(s);
      setIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finish session');
    }
  }

  async function handleRate(slug: string, rating: number) {
    if (!session) return;
    try {
      const s = await rateMockSessionProblem(session.id, slug, rating);
      setSession(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rating');
    }
  }

  function handleExit() {
    setSession(null);
    fetchMockHistory().then(setHistory).catch(() => {});
  }

  if (session) {
    const card = session.cards?.[index];
    const reviewing = !!session.endedAt;

    return (
      <div className="mock-interview">
        <div className="daily-progress pixel-panel">
          <span className="daily-progress-label">MOCK INTERVIEW</span>
          <span className="daily-progress-count">
            {reviewing ? 'Review' : formatClock(remainingMs)} · problem {index + 1} /{' '}
            {session.slugs.length}
          </span>
        </div>

        {error && <div className="login-message login-error">{error}</div>}

        {card && (
          <MockCard
            card={card}
            revealed={reviewing}
            rating={session.ratings[card.slug]}
            onRate={(r) => handleRate(card.slug, r)}
          />
        )}

        <div className="deck-controls">
          <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            ← Prev
          </button>
          <button
            onClick={() => setIndex((i) => Math.min(session.slugs.length - 1, i + 1))}
            disabled={index === session.slugs.length - 1}
          >
            Next →
          </button>
          {!reviewing && (
            <button className="pixel-btn accent" onClick={handleFinish}>
              Finish now
            </button>
          )}
          {reviewing && (
            <button className="pixel-btn" onClick={handleExit}>
              Back to setup
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mock-interview">
      <div className="pixel-panel daily-summary">
        <p>Timed mock interview — N random solved problems, question only, code hidden until time's up.</p>
        {error && <div className="login-message login-error">{error}</div>}
        <div className="mock-setup-row">
          <label>
            Duration
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>
          <label>
            Problems
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
        </div>
        <button className="pixel-btn accent" onClick={handleStart} disabled={starting}>
          {starting ? 'Starting…' : 'Start session'}
        </button>
      </div>

      {history && history.length > 0 && (
        <div className="pixel-panel mock-history">
          <div className="daily-progress-label" style={{ marginBottom: 8 }}>
            PAST SESSIONS
          </div>
          <ul className="mock-history-list">
            {history.map((s) => (
              <li key={s.id}>
                <span>{new Date(s.startedAt).toLocaleDateString()}</span>
                <span>{s.durationMinutes} min</span>
                <span>{s.slugs.length} problems</span>
                <span>{averageRating(s) ? `avg ${averageRating(s)}/5` : 'unrated'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MockCard({
  card,
  revealed,
  rating,
  onRate,
}: {
  card: NonNullable<MockSession['cards']>[number];
  revealed: boolean;
  rating: number | undefined;
  onRate: (rating: number) => void;
}) {
  const cleanHtml = useMemo(() => DOMPurify.sanitize(card.contentHtml || ''), [card.contentHtml]);
  const highlighted = useMemo(() => {
    if (!revealed) return '';
    const lang = LANG_ALIASES[card.lang?.toLowerCase() ?? ''] ?? undefined;
    try {
      return lang
        ? hljs.highlight(card.code || '', { language: lang }).value
        : hljs.highlightAuto(card.code || '').value;
    } catch {
      return card.code || '';
    }
  }, [card.code, card.lang, revealed]);

  return (
    <div className="pixel-panel mock-card">
      <div className="card-header">
        <span className={`difficulty-badge difficulty-${card.difficulty?.toLowerCase()}`}>
          {card.difficulty}
        </span>
        <h2>
          {card.questionId ? `${card.questionId}. ` : ''}
          {card.title}
        </h2>
        {card.sourceUrl && (
          <a className="solve-it-link" href={card.sourceUrl} target="_blank" rel="noopener noreferrer">
            Solve it ↗
          </a>
        )}
      </div>
      <div className="problem-content" dangerouslySetInnerHTML={{ __html: cleanHtml }} />

      {revealed && (
        <>
          <div className="card-header">
            <span className="lang-badge">{card.lang}</span>
          </div>
          {card.code ? (
            <pre className="code-block">
              <code
                className={`hljs language-${card.lang}`}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </pre>
          ) : (
            <div className="code-block empty-code">No solution saved for this one.</div>
          )}
          <div className="mock-rating-row">
            <span>How did it go?</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`pixel-btn small ${rating === n ? 'accent' : 'ghost'}`}
                onClick={() => onRate(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
