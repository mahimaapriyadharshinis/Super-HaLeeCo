import { useState } from 'react';
import { submitManualLogin } from '../api';
import type { AuthStatus } from '../api';

interface Props {
  onConnected: (auth: AuthStatus) => void;
}

export default function ManualConnect({ onConnected }: Props) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const auth = await submitManualLogin(session.trim(), csrfToken.trim());
      onConnected(auth);
      setOpen(false);
      setSession('');
      setCsrfToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="pixel-btn ghost small manual-connect-toggle" onClick={() => setOpen(true)}>
        Popup not working? Paste cookies manually
      </button>
    );
  }

  return (
    <form className="manual-connect-form" onSubmit={submit}>
      <p className="manual-connect-hint">
        LeetCode.com → log in normally in your own browser → DevTools (F12) → Application → Cookies
        → leetcode.com → copy these two values:
      </p>
      <input
        placeholder="LEETCODE_SESSION value"
        value={session}
        onChange={(e) => setSession(e.target.value)}
        required
      />
      <input
        placeholder="csrftoken value"
        value={csrfToken}
        onChange={(e) => setCsrfToken(e.target.value)}
        required
      />
      {error && <div className="add-panel-error">{error}</div>}
      <div className="manual-connect-actions">
        <button className="pixel-btn small" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Save & Connect'}
        </button>
        <button
          className="pixel-btn small ghost"
          type="button"
          onClick={() => {
            setOpen(false);
            setError('');
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
