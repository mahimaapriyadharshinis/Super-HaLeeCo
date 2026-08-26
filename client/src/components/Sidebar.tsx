import type { ProblemSummary, ActivityData, AuthStatus, LoginState } from '../api';
import StreakBoard from './StreakBoard';
import ManualConnect from './ManualConnect';

type View = 'deck' | 'analysis' | 'daily' | 'mock';

interface Props {
  collapsed: boolean;
  view: View;
  problems: ProblemSummary[];
  tags: string[];
  companies: string[];
  search: string;
  difficulty: string;
  tag: string;
  companyFilter: string;
  sourceFilter: 'own' | 'public' | '';
  currentSlug: string | undefined;
  syncStatus: 'idle' | 'running' | 'done' | 'error';
  syncMessage: string;
  companySyncStatus: 'idle' | 'running' | 'done' | 'error';
  companySyncMessage: string;
  activity: ActivityData | null;
  authStatus: AuthStatus | null;
  loginState: LoginState | null;
  offline: boolean;
  onSearchChange: (v: string) => void;
  onDifficultyChange: (v: string) => void;
  onTagChange: (v: string) => void;
  onCompanyFilterChange: (v: string) => void;
  onSourceFilterChange: (v: 'own' | 'public' | '') => void;
  onSelect: (slug: string) => void;
  onSync: () => void;
  onSyncCompanies: () => void;
  onAddCards: () => void;
  onConnect: () => void;
  onViewChange: (v: View) => void;
  onManualConnected: (auth: AuthStatus) => void;
  onExport: () => void;
  onImport: () => void;
}

const DIFFICULTIES = ['', 'Easy', 'Medium', 'Hard'];
const SOURCES: { value: 'own' | 'public' | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'own', label: 'Mine' },
  { value: 'public', label: 'Public/AI' },
];

const SOURCE_TAG: Record<string, string> = { own: 'MINE', manual: 'PASTE', ai: 'AI' };

export default function Sidebar({
  collapsed,
  view,
  problems,
  tags,
  companies,
  search,
  difficulty,
  tag,
  companyFilter,
  sourceFilter,
  currentSlug,
  syncStatus,
  syncMessage,
  companySyncStatus,
  companySyncMessage,
  activity,
  authStatus,
  loginState,
  offline,
  onSearchChange,
  onDifficultyChange,
  onTagChange,
  onCompanyFilterChange,
  onSourceFilterChange,
  onSelect,
  onSync,
  onSyncCompanies,
  onAddCards,
  onConnect,
  onViewChange,
  onManualConnected,
  onExport,
  onImport,
}: Props) {
  const connected = !!authStatus?.connected;
  const loggingIn = loginState?.status === 'waiting';

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <h1 className="title-glow">HaLeeCo</h1>
      </div>

      <div className="view-tabs">
        <button className={view === 'deck' ? 'active' : ''} onClick={() => onViewChange('deck')}>
          Deck
        </button>
        <button className={view === 'daily' ? 'active' : ''} onClick={() => onViewChange('daily')}>
          Today's Work
        </button>
        <button className={view === 'mock' ? 'active' : ''} onClick={() => onViewChange('mock')}>
          Mock
        </button>
        <button
          className={view === 'analysis' ? 'active' : ''}
          onClick={() => onViewChange('analysis')}
        >
          Analysis
        </button>
      </div>

      <StreakBoard activity={activity} />

      {connected ? (
        <div className="connect-status connected">
          <span className="connect-label">
            ✓ <span className="connect-user">@{authStatus?.username}</span>
          </span>
          <button
            className="pixel-btn ghost small reconnect-btn"
            onClick={onConnect}
            disabled={offline}
          >
            reconnect
          </button>
        </div>
      ) : (
        <>
          <button className="pixel-btn accent" onClick={onConnect} disabled={loggingIn || offline}>
            {loggingIn ? 'WAITING FOR LOGIN…' : 'CONNECT LEETCODE'}
          </button>
          {!offline && <ManualConnect onConnected={onManualConnected} />}
        </>
      )}
      {loginState && loginState.status !== 'idle' && (
        <div className={`login-message login-${loginState.status}`}>{loginState.message}</div>
      )}

      <div className="action-row">
        <button
          className="pixel-btn"
          onClick={onSync}
          disabled={syncStatus === 'running' || !connected || offline}
        >
          {syncStatus === 'running' ? 'SYNCING…' : 'SYNC MINE'}
        </button>
        <button className="pixel-btn accent" onClick={onAddCards} disabled={offline}>
          + ADD CARDS
        </button>
      </div>
      {syncMessage && <div className={`sync-message sync-${syncStatus}`}>{syncMessage}</div>}

      <div className="action-row">
        <button
          className="pixel-btn small"
          onClick={onSyncCompanies}
          disabled={companySyncStatus === 'running' || offline}
          title="Tag your deck with which companies have asked each LeetCode problem"
        >
          {companySyncStatus === 'running' ? 'TAGGING…' : 'SYNC COMPANIES'}
        </button>
        <button className="pixel-btn ghost small" onClick={onExport}>
          EXPORT
        </button>
        <button className="pixel-btn ghost small" onClick={onImport}>
          IMPORT
        </button>
      </div>
      {companySyncMessage && (
        <div className={`sync-message sync-${companySyncStatus}`}>{companySyncMessage}</div>
      )}

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

      <select
        className="tag-select"
        value={companyFilter}
        onChange={(e) => onCompanyFilterChange(e.target.value)}
      >
        <option value="">All companies</option>
        {companies.map((c) => (
          <option key={c} value={c}>
            {c}
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
