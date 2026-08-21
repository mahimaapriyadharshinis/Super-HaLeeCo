import type { ProblemSummary, ActivityData, AuthStatus, LoginState } from '../api';
import StreakBoard from './StreakBoard';

interface Props {
  problems: ProblemSummary[];
  tags: string[];
  search: string;
  difficulty: string;
  tag: string;
  sourceFilter: 'own' | 'public' | '';
  currentSlug: string | undefined;
  syncStatus: 'idle' | 'running' | 'done' | 'error';
  syncMessage: string;
  activity: ActivityData | null;
  authStatus: AuthStatus | null;
  loginState: LoginState | null;
  onSearchChange: (v: string) => void;
  onDifficultyChange: (v: string) => void;
  onTagChange: (v: string) => void;
  onSourceFilterChange: (v: 'own' | 'public' | '') => void;
  onSelect: (slug: string) => void;
  onSync: () => void;
  onAddCards: () => void;
  onConnect: () => void;
}

const DIFFICULTIES = ['', 'Easy', 'Medium', 'Hard'];
const SOURCES: { value: 'own' | 'public' | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'own', label: 'Mine' },
  { value: 'public', label: 'Public/AI' },
];

const SOURCE_TAG: Record<string, string> = { own: 'MINE', manual: 'PASTE', ai: 'AI' };

export default function Sidebar({
  problems,
  tags,
  search,
  difficulty,
  tag,
  sourceFilter,
  currentSlug,
  syncStatus,
  syncMessage,
  activity,
  authStatus,
  loginState,
  onSearchChange,
  onDifficultyChange,
  onTagChange,
  onSourceFilterChange,
  onSelect,
  onSync,
  onAddCards,
  onConnect,
}: Props) {
  const connected = !!authStatus?.connected;
  const loggingIn = loginState?.status === 'waiting';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>
          <span className="title-glow">LEETCODE</span>
          <br />
          FLASHCARDS
        </h1>
      </div>

      <StreakBoard activity={activity} />

      {connected ? (
        <div className="connect-status connected">
          <span className="connect-label">
            ✓ <span className="connect-user">@{authStatus?.username}</span>
          </span>
          <button className="pixel-btn ghost small reconnect-btn" onClick={onConnect}>
            reconnect
          </button>
        </div>
      ) : (
        <button className="pixel-btn accent" onClick={onConnect} disabled={loggingIn}>
          {loggingIn ? 'WAITING FOR LOGIN…' : '🔗 CONNECT LEETCODE'}
        </button>
      )}
      {loginState && loginState.status !== 'idle' && (
        <div className={`login-message login-${loginState.status}`}>{loginState.message}</div>
      )}

      <div className="action-row">
        <button className="pixel-btn" onClick={onSync} disabled={syncStatus === 'running' || !connected}>
          {syncStatus === 'running' ? 'SYNCING…' : 'SYNC MINE'}
        </button>
        <button className="pixel-btn accent" onClick={onAddCards}>
          + ADD CARDS
        </button>
      </div>
      {syncMessage && <div className={`sync-message sync-${syncStatus}`}>{syncMessage}</div>}

      <input
        className="search-input"
        placeholder="&gt; search title_"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="filter-row">
        {SOURCES.map((s) => (
          <button
            key={s.value || 'all'}
            className={`filter-chip ${sourceFilter === s.value ? 'active' : ''}`}
            onClick={() => onSourceFilterChange(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="filter-row">
        {DIFFICULTIES.map((d) => (
          <button
            key={d || 'all'}
            className={`filter-chip ${difficulty === d ? 'active' : ''}`}
            onClick={() => onDifficultyChange(d)}
          >
            {d || 'All'}
          </button>
        ))}
      </div>

      <select className="tag-select" value={tag} onChange={(e) => onTagChange(e.target.value)}>
        <option value="">All tags</option>
        {tags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <div className="problem-count">{problems.length} problems</div>

      <ul className="problem-list">
        {problems.map((p) => (
          <li
            key={p.slug}
            className={p.slug === currentSlug ? 'active' : ''}
            onClick={() => onSelect(p.slug)}
          >
            <span className={`dot difficulty-${p.difficulty?.toLowerCase()}`} />
            <span className="problem-list-title">
              {p.questionId ? `${p.questionId}. ` : ''}
              {p.title}
            </span>
            <span className={`source-tag source-${p.source}`}>{SOURCE_TAG[p.source]}</span>
          </li>
        ))}
        {problems.length === 0 && (
          <li className="empty-state">
            No problems yet. Connect LeetCode to sync your own, or use "Add Cards" for public/AI
            ones.
          </li>
        )}
      </ul>
    </aside>
  );
}
