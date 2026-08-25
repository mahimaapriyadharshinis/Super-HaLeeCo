import type { AuthStatus, LoginState } from '../api';
import ManualConnect from './ManualConnect';

interface Props {
  authStatus: AuthStatus | null;
  loginState: LoginState | null;
  onConnect: () => void;
  onContinue: () => void;
  onManualConnected: (auth: AuthStatus) => void;
}

export default function LandingPage({
  authStatus,
  loginState,
  onConnect,
  onContinue,
  onManualConnected,
}: Props) {
  const connected = !!authStatus?.connected;
  const loggingIn = loginState?.status === 'waiting';

  return (
    <div className="landing">
      <div className="landing-bg" />

      <div className="landing-content">
        <h1 className="landing-title">HaLeeCo</h1>
        <p className="landing-tagline">
          LeetCode &middot; Codeforces &middot; HackerRank — one deck, real practice.
        </p>

        <div className="pixel-panel landing-portal">
          {connected ? (
            <>
              <p className="landing-connected">✓ connected as @{authStatus?.username}</p>
              <button className="pixel-btn accent" onClick={onContinue}>
                ENTER →
              </button>
            </>
          ) : (
            <>
              <button className="pixel-btn accent" onClick={onConnect} disabled={loggingIn}>
                {loggingIn ? 'WAITING FOR LOGIN…' : '🔗 CONNECT LEETCODE'}
              </button>
              {loginState && loginState.status !== 'idle' && (
                <div className={`login-message login-${loginState.status}`}>{loginState.message}</div>
              )}
              <ManualConnect onConnected={onManualConnected} />
              <button className="pixel-btn ghost landing-skip" onClick={onContinue}>
                Continue without connecting →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
