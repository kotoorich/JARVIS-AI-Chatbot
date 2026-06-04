import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, LogIn, Loader2, Sparkles } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import AuthInput from '@/components/AuthInput';
import { useAuth } from '@/lib/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Email is required');
    if (!password) return setError('Password is required');
    setLoading(true);
    const result = await login(email.trim(), password);
    if (!result.success) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your conversation with JARVIS."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="text-cyan-300 hover:text-cyan-200 font-medium">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2"
          >
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

        <AuthInput
          id="password"
          label="Password"
          type="password"
          icon={Lock}
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-cyan-300">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-semibold py-2.5 text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:from-cyan-400 hover:to-cyan-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <LogIn className="h-4 w-4" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-[11px] text-center text-slate-500 flex items-center justify-center gap-1.5">
          <Sparkles className="h-3 w-3" /> Secured with bcrypt & JWT
        </p>
      </form>
    </AuthLayout>
  );
}
