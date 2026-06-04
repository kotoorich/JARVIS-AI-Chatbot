import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, KeyRound, Loader2, Check, ShieldAlert } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import AuthInput from '@/components/AuthInput';
import { apiErrorMessage } from '@/lib/api-error';
import api from '@/api/Client';

/**
 * Reset-password landing. Requires a `token` query parameter. POSTs to
 * /api/auth/reset-password with the token and the new password.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const checks = useMemo(() => ({
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    digit: /\d/.test(password),
    match: !!password && password === confirm,
  }), [password, confirm]);

  if (!token && !done) {
    return (
      <AuthLayout
        title="Reset link invalid"
        subtitle="This link is missing or has expired. Request a new one to continue."
        footer={
          <Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col items-center text-center gap-4">
          <ShieldAlert className="h-12 w-12 text-amber-300" />
          <Link
            to="/forgot-password"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-semibold py-2.5 px-4 text-sm shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-cyan-300 transition-all"
          >
            <KeyRound className="h-4 w-4" /> Request new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!checks.length || !checks.letter || !checks.digit) {
      return setError('Please meet all password requirements');
    }
    if (!checks.match) return setError('Passwords do not match');
    setSubmitting(true);
    try {
      await api.post('/api/auth/reset-password', {
        token, new_password: password,
      });
      setDone(true);
      // Give the user a moment to read the success state, then bounce to login
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err) {
      setError(apiErrorMessage(err) || 'Could not reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="Redirecting you to sign in…">
        <div className="flex flex-col items-center text-center gap-3">
          <Check className="h-12 w-12 text-cyan-300" />
          <p className="text-sm text-slate-300">You can now sign in with your new password.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something strong — you won't need to remember it on shared devices if you use a password manager."
      footer={<Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
        {error && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <AuthInput id="new_pw" label="New password" type="password" icon={Lock}
          value={password} onChange={setPassword} placeholder="••••••••"
          required autoComplete="new-password"
        />

        {password.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <Req met={checks.length} label="At least 8 characters" />
            <Req met={checks.letter} label="Includes a letter" />
            <Req met={checks.digit} label="Includes a number" />
            <Req met={checks.match} label="Matches confirmation" />
          </ul>
        )}

        <AuthInput id="confirm_pw" label="Confirm password" type="password" icon={Lock}
          value={confirm} onChange={setConfirm} placeholder="••••••••"
          required autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-semibold py-2.5 text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:from-cyan-400 hover:to-cyan-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <KeyRound className="h-4 w-4" />}
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  );
}

function Req({ met, label }) {
  return (
    <li className={`flex items-center gap-1.5 ${met ? 'text-cyan-300' : 'text-slate-500'}`}>
      <span className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border ${
        met ? 'border-cyan-300 bg-cyan-300/20' : 'border-slate-600'
      }`}>
        {met && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </li>
  );
}
