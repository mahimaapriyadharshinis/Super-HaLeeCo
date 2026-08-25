import { useEffect, useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import FlashCard from './components/FlashCard';
import AddCardsPanel from './components/AddCardsPanel';
import LandingPage from './components/LandingPage';
import AnalysisView from './components/AnalysisView';
import {
  fetchProblems,
  fetchTags,
  fetchProblem,
  triggerSync,
  fetchConfig,
  fetchActivity,
  pingActivity,
  updateProblem,
  fetchAuthStatus,
  startLogin,
  fetchLoginStatus,
} from './api';
import type { ProblemSummary, ProblemDetail, ActivityData, AuthStatus, LoginState } from './api';
import './styles.css';

export default function App() {
  const [entered, setEntered] = useState(false);
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tag, setTag] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'own' | 'public' | ''>('');
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<ProblemDetail | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loginState, setLoginState] = useState<LoginState | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<'deck' | 'analysis'>('deck');

  // Reviewing an already-synced/added deck needs zero internet access — only
  // Connect/Sync/Add Cards/AI talk to anything outside localhost. Surface
  // that distinction instead of letting those calls fail with a raw error.
  useEffect(() => {
    function goOnline() {
      setOffline(false);
    }
    function goOffline() {
      setOffline(true);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const loadProblems = useCallback(() => {
    fetchProblems({ difficulty, tag, q: search, source: sourceFilter }).then((list) => {
      setProblems(list);
      if (pendingSlug) {
        const i = list.findIndex((p) => p.slug === pendingSlug);
        setPendingSlug(null);
        if (i >= 0) {
          setIndex(i);
          return;
        }
      }
      setIndex(0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, tag, search, sourceFilter, pendingSlug]);

  useEffect(() => {
    fetchConfig().then((c) => setAiEnabled(c.aiEnabled));
    fetchActivity().then(setActivity);
    fetchAuthStatus().then(setAuthStatus);
  }, []);

  useEffect(() => {
    fetchTags().then(setTags);
  }, [syncStatus]);

  useEffect(() => {
    const id = setTimeout(loadProblems, 200);
    return () => clearTimeout(id);
  }, [loadProblems]);

  useEffect(() => {
    setFlipped(false);
    const slug = problems[index]?.slug;
    if (!slug) {
      setCurrent(null);
      return;
    }
    fetchProblem(slug).then(setCurrent);
    pingActivity().then(setActivity);
  }, [problems, index]);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, problems.length - 1));
  }, [problems.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const shuffle = useCallback(() => {
    setIndex(Math.floor(Math.random() * problems.length));
  }, [problems.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === 'ArrowRight') {
        goNext();
      } else if (e.code === 'ArrowLeft') {
        goPrev();
      } else if (e.code === 'KeyS') {
        shuffle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, shuffle]);

  async function handleSync() {
    setSyncStatus('running');
    setSyncMessage('Pulling accepted submissions from LeetCode…');
    try {
      const summary = await triggerSync();
      setSyncStatus('done');
      setSyncMessage(
        `Synced ${summary.updated} new/updated, ${summary.skipped} already up to date (of ${summary.totalAccepted} accepted).`
      );
      loadProblems();
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    }
  }

  async function handleConnect() {
    const s = await startLogin();
    setLoginState(s);
  }

  function handleManualConnected(auth: AuthStatus) {
    setAuthStatus(auth);
    setLoginState({ status: 'idle', message: '' });
    if (auth.connected) handleSync();
  }

  // While a browser-assisted login is in progress, poll for it to finish,
  // then refresh auth status and auto-sync — this is the "log in and it
  // just syncs" flow instead of manually pasting cookies.
  useEffect(() => {
    if (loginState?.status !== 'waiting') return;
    const id = setInterval(async () => {
      const s = await fetchLoginStatus();
      setLoginState(s);
      if (s.status === 'success') {
        const auth = await fetchAuthStatus();
        setAuthStatus(auth);
        if (auth.connected) handleSync();
      }
    }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginState?.status]);

  function handleImported(slug: string) {
    setShowAddPanel(false);
    // Don't call loadProblems() here — it would run with this render's
    // stale (pre-update) pendingSlug closure and jump to index 0. Setting
    // pendingSlug triggers the debounced reload effect with a fresh
    // closure that actually finds and jumps to the new card.
    setPendingSlug(slug);
    setView('deck');
  }

  async function handleSaveCode(code: string, lang: string) {
    if (!current) return;
    const updated = await updateProblem(current.slug, { code, lang });
    setCurrent(updated);
  }

  if (!entered) {
    return (
      <LandingPage
        authStatus={authStatus}
        loginState={loginState}
        onConnect={handleConnect}
        onContinue={() => setEntered(true)}
        onManualConnected={handleManualConnected}
      />
    );
  }

  return (
    <div className="app">
      {offline && (
        <div className="offline-banner">
          ⚠ OFFLINE — browsing your saved deck still works. Connect / Sync / Add Cards / AI need
          internet.
        </div>
      )}
      <Sidebar
        collapsed={sidebarCollapsed}
        view={view}
        problems={problems}
        tags={tags}
        search={search}
        difficulty={difficulty}
        tag={tag}
        sourceFilter={sourceFilter}
        currentSlug={problems[index]?.slug}
        syncStatus={syncStatus}
        syncMessage={syncMessage}
        activity={activity}
        authStatus={authStatus}
        loginState={loginState}
        offline={offline}
        onSearchChange={setSearch}
        onDifficultyChange={setDifficulty}
        onTagChange={setTag}
        onSourceFilterChange={setSourceFilter}
        onSelect={(slug) => {
          setView('deck');
          setIndex(problems.findIndex((p) => p.slug === slug));
        }}
        onSync={handleSync}
        onAddCards={() => setShowAddPanel(true)}
        onConnect={handleConnect}
        onViewChange={setView}
        onManualConnected={handleManualConnected}
      />

      <button
        className="sidebar-toggle"
        style={{ left: sidebarCollapsed ? 0 : 340 }}
        onClick={() => setSidebarCollapsed((c) => !c)}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {sidebarCollapsed ? '›' : '‹'}
      </button>

      <main className="main">
        {view === 'analysis' ? (
          <AnalysisView />
        ) : current ? (
          <>
            <div className="deck-controls">
              <button onClick={goPrev} disabled={index === 0}>
                ← Prev
              </button>
              <span className="progress">
                {index + 1} / {problems.length}
              </span>
              <button onClick={goNext} disabled={index === problems.length - 1}>
                Next →
              </button>
              <button className="shuffle-btn" onClick={shuffle}>
                🔀 Shuffle
              </button>
            </div>
            <FlashCard
              problem={current}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              onSaveCode={handleSaveCode}
            />
          </>
        ) : (
          <div className="empty-main">
            <p>No flashcards yet.</p>
            <p>Connect LeetCode to sync your own solves, or use "+ Add Cards" for public/AI ones.</p>
          </div>
        )}
      </main>

      {showAddPanel && (
        <AddCardsPanel
          aiEnabled={aiEnabled}
          onClose={() => setShowAddPanel(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
