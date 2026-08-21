import { useMemo, useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import type { ProblemDetail } from '../api';

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

const SOURCE_LABEL: Record<string, string> = {
  own: 'YOUR SOLVE',
  manual: 'PASTED',
  ai: 'AI GENERATED',
};

interface Props {
  problem: ProblemDetail;
  flipped: boolean;
  onFlip: () => void;
  onSaveCode: (code: string, lang: string) => void;
}

export default function FlashCard({ problem, flipped, onFlip, onSaveCode }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftCode, setDraftCode] = useState(problem.code);
  const [draftLang, setDraftLang] = useState(problem.lang);

  useEffect(() => {
    setEditing(false);
    setDraftCode(problem.code);
    setDraftLang(problem.lang);
  }, [problem.slug]);

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

  function stopFlip(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={onFlip}>
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
            <span className={`source-badge source-${problem.source}`}>
              {SOURCE_LABEL[problem.source]}
            </span>
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

          {editing ? (
            <div className="code-edit" onClick={stopFlip}>
              <input
                className="lang-input"
                value={draftLang}
                onChange={(e) => setDraftLang(e.target.value)}
                placeholder="language"
              />
              <textarea
                className="code-textarea"
                value={draftCode}
                onChange={(e) => setDraftCode(e.target.value)}
                rows={16}
                autoFocus
              />
              <div className="code-edit-actions">
                <button
                  className="pixel-btn small"
                  onClick={() => {
                    onSaveCode(draftCode, draftLang);
                    setEditing(false);
                  }}
                >
                  Save
                </button>
                <button
                  className="pixel-btn small ghost"
                  onClick={() => {
                    setDraftCode(problem.code);
                    setDraftLang(problem.lang);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
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
              {problem.source !== 'own' && (
                <button
                  className="pixel-btn small edit-code-btn"
                  onClick={(e) => {
                    stopFlip(e);
                    setEditing(true);
                  }}
                >
                  {problem.code ? 'Edit code' : '+ Add code'}
                </button>
              )}
              <div className="flip-hint">Click card or press space to go back →</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
