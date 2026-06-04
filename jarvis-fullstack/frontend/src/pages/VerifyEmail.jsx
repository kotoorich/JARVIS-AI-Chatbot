import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldAlert, Loader2, KeyRound } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { useAuth } from '@/lib/AuthContext';
import { apiErrorMessage } from '@/lib/api-error';
import api from '@/api/Client';

/**
 * Email verification landing page. Reads `?token=…` from the URL and POSTs
 * it to /api/auth/verify-email. Works for both signed-in and signed-out
 * users — the backend doesn't require auth here (verifying an email
 * shouldn't require having the password).
 *
 * If a user is signed in we refresh their session afterwards so the
 * "verify email" banner disappears immediately.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  // States: 'pending' | 'success' | 'error'
  const [state, setState] = useState(token ? 'pending' : 'error');
  const [errorMsg, setErrorMsg] = useState(
    token ? '' : "This verification link is missing a token. Check the URL or request a new email.",
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post('/api/auth/verify-email', { token });
        if (cancelled) return;
        setState('success');
        if (user) {
          // Refresh so the banner clears
          try { await refreshUser(); } catch {}
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(apiErrorMessage(err) || 'Could not verify email.');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
    // We intentionally depend only on token — refreshUser and user shouldn't
    // re-trigger verification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === 'pending') {
    return (
      <AuthLayout title="Verifying email…" subtitle="One moment.">
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <Loader2 className="h-10 w-10 text-cyan-300 animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (state === 'success') {
    return (
      <AuthLayout
        title="Email verified"
        subtitle="Thanks — your account is fully set up."
        footer={
          user
            ? <Link to="/chat" className="text-cyan-300 hover:text-cyan-200 font-medium">Continue to JARVIS</Link>
            : <Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">Sign in</Link>
        }
      >
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <CheckCircle2 className="h-12 w-12 text-cyan-300" />
          <button
            onClick={() => navigate(user ? '/chat' : '/login', { replace: true })}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-semibold py-2.5 px-4 text-sm shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-cyan-300 transition-all"
          >
            {user ? 'Open JARVIS' : 'Sign in'}
          </button>
        </div>
      </AuthLayout>
    );
  }

  // error
  return (
    <AuthLayout
      title="Verification failed"
      subtitle="This link might have expired or already been used."
      footer={
        user
          ? <Link to="/settings" className="text-cyan-300 hover:text-cyan-200 font-medium">Open settings</Link>
          : <Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">Back to sign in</Link>
      }
    >
      <div className="flex flex-col items-center text-center gap-3">
        <ShieldAlert className="h-12 w-12 text-amber-300" />
        <p className="text-sm text-slate-300">{errorMsg}</p>
        {user && (
          <p className="text-xs text-slate-400 mt-2">
            Sign in and use the resend button in the banner or in Settings to get a fresh link.
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
