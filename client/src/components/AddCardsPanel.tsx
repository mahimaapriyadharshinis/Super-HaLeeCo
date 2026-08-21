import { useState } from 'react';
import {
  searchLeetCode,
  fetchRandomLeetCode,
  importProblem,
  createManualProblem,
} from '../api';
import type { PublicQuestion } from '../api';

const LANGUAGES = [
  'Python3',
  'Java',
  'C++',
  'JavaScript',
  'TypeScript',
  'Go',
  'C#',
  'Kotlin',
  'Swift',
  'Rust',
];

interface Props {
  aiEnabled: boolean;
  onClose: () => void;
  onImported: (slug: string) => void;
}

type Tab = 'search' | 'random' | 'manual';

export default function AddCardsPanel({ aiEnabled, onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [genSolution, setGenSolution] = useState(aiEnabled);
  const [language, setLanguage] = useState('Python3');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicQuestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [manualTitle, setManualTitle] = useState('');
  const [manualDifficulty, setManualDifficulty] = useState('Medium');
  const [manualTags, setManualTags] = useState('');
  const [manualQuestion, setManualQuestion] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [manualLang, setManualLang] = useState('Python3');
  const [savingManual, setSavingManual] = useState(false);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setSearching(true);
    setError('');
    try {
      setResults(await searchLeetCode(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function doImport(slug: string) {
    setBusySlug(slug);
    setError('');
    try {
      const problem = await importProblem({
        slug,
        generateSolution: genSolution && aiEnabled,
        language,
      });
      onImported(problem.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusySlug(null);
    }
  }

  async function doRandom() {
    setBusySlug('__random__');
    setError('');
    try {
      const q = await fetchRandomLeetCode();
      await doImport(q.titleSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Random import failed');
      setBusySlug(null);
    }
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    setSavingManual(true);
    setError('');
    try {
      const contentHtml = manualQuestion
        .split('\n')
        .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
        .join('\n');
      const problem = await createManualProblem({
        title: manualTitle.trim(),
        difficulty: manualDifficulty,
        tags: manualTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        contentHtml,
        code: manualCode,
        lang: manualLang,
      });
      onImported(problem.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pixel-panel add-panel" onClick={(e) => e.stopPropagation()}>
        <div className="add-panel-header">
          <span>ADD CARDS</span>
          <button className="pixel-btn close-btn" onClick={onClose}>
            X
          </button>
        </div>

        <div className="add-panel-tabs">
          <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>
            Search LeetCode
          </button>
          <button className={tab === 'random' ? 'active' : ''} onClick={() => setTab('random')}>
            Random
          </button>
          <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>
            Manual / Paste
          </button>
        </div>

        {(tab === 'search' || tab === 'random') && aiEnabled && (
          <div className="ai-toggle-row">
            <label>
              <input
                type="checkbox"
                checked={genSolution}
                onChange={(e) => setGenSolution(e.target.checked)}
              />
              Generate AI solution
            </label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        {(tab === 'search' || tab === 'random') && !aiEnabled && (
          <div className="ai-disabled-note">
            No GEMINI_API_KEY configured — cards will be added with blank code for you to fill
            in yourself. See README to enable AI-generated solutions.
          </div>
        )}

        {error && <div className="add-panel-error">{error}</div>}

        {tab === 'search' && (
          <>
            <form className="search-row" onSubmit={runSearch}>
              <input
                autoFocus
                placeholder="Problem title, e.g. two sum"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="pixel-btn" type="submit" disabled={searching}>
                {searching ? '...' : 'Go'}
              </button>
            </form>
            <ul className="public-results">
              {results.map((q) => (
                <li key={q.titleSlug}>
                  <span className={`difficulty-badge difficulty-${q.difficulty.toLowerCase()}`}>
                    {q.difficulty[0]}
                  </span>
                  <span className="result-title">
                    {q.questionFrontendId}. {q.title}
                  </span>
                  {q.isPaidOnly ? (
                    <span className="premium-tag">premium</span>
                  ) : (
                    <button
                      className="pixel-btn small"
                      disabled={busySlug === q.titleSlug}
                      onClick={() => doImport(q.titleSlug)}
                    >
                      {busySlug === q.titleSlug ? '...' : '+ Add'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === 'random' && (
          <div className="random-tab">
            <p>Pull a random free LeetCode problem and add it as a card.</p>
            <button className="pixel-btn" onClick={doRandom} disabled={busySlug === '__random__'}>
              {busySlug === '__random__' ? 'Fetching...' : '🎲 Random Problem'}
            </button>
          </div>
        )}

        {tab === 'manual' && (
          <form className="manual-form" onSubmit={submitManual}>
            <input
              placeholder="Title"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              required
            />
            <div className="manual-row">
              <select value={manualDifficulty} onChange={(e) => setManualDifficulty(e.target.value)}>
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
              <input
                placeholder="Tags (comma separated)"
                value={manualTags}
                onChange={(e) => setManualTags(e.target.value)}
              />
            </div>
            <textarea
              placeholder="Question + testcases (paste from anywhere — a resource, an LLM, your notes)"
              value={manualQuestion}
              onChange={(e) => setManualQuestion(e.target.value)}
              rows={6}
            />
            <div className="manual-row">
              <input
                placeholder="Language (e.g. Python3)"
                value={manualLang}
                onChange={(e) => setManualLang(e.target.value)}
              />
            </div>
            <textarea
              className="code-textarea"
              placeholder="Solution code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              rows={8}
            />
            <button className="pixel-btn" type="submit" disabled={savingManual}>
              {savingManual ? 'Saving...' : 'Save Card'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
