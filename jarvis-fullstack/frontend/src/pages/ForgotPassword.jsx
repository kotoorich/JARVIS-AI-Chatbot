import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send, Loader2, Info, CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import AuthInput from '@/components/AuthInput';
import api from '@/api/Client';

/**
 * Forgot-password page. Posts to /api/auth/forgot-password which always
 * returns the same generic message regardless of whether the address is
 * registered — we never confirm or deny account existence here.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      // Backend rate-limits but still returns 200, so this is rare. Network
      // errors land here.
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="If an account exists for that email, we've sent password reset instructions."
        footer={
          <>
            Wrong email?{' '}
            <button onClick={() => setSent(false)} className="text-cyan-300 hover:text-cyan-200 font-medium">
              Try another
            </button>
            {' · '}
            <Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">
              Back to sign in
            </Link>
          </>
        }
      >
        <div className="flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="h-12 w-12 text-cyan-300" />
          <p className="text-sm text-slate-300">
            The reset link will expire in 30 minutes. Check your spam folder if it doesn't arrive within a few minutes.
          </p>
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 text-cyan-200/90 text-xs px-3 py-2 mt-2 flex gap-2">
            <Info className="h-4 w-4 shrink-0" />
            <span className="text-left">
              In dev mode the email prints to the backend console. In production, configure SMTP via env vars.
            </span>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot password?"
      subtitle="Enter the email tied to your account and we'll send a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
            {error}
          </div>
        )}
        <AuthInput
          id="email"
          label="Email"
          type="email"
          icon={Mail}
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-semibold py-2.5 text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:from-cyan-400 hover:to-cyan-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />}
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  );
}
