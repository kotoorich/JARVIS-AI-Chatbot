import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import JarvisLogo from './JarvisLogo';

/**
 * Themed auth-page shell.
 *  - JARVIS arc-reactor logo (animated)
 *  - Cyan gradient background with drifting orbs and faint grid
 *  - Glassmorphic card with subtle motion entry
 *  - Fully responsive: card is full-width on mobile, max-w-md on sm+
 *  - Decorative elements use `aria-hidden` and `pointer-events-none` so they
 *    don't interfere with screen readers or click targets.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-slate-950 text-slate-100 px-4 py-10">
      {/* Background — gradient + orbs + faint grid */}
      <BackgroundDecor />

      {/* Home link */}
      <Link
        to="/"
        className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 text-xs sm:text-sm text-slate-400 hover:text-cyan-300 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-7">
          <div className="mb-4">
            <JarvisLogo size={72} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-center bg-gradient-to-r from-cyan-200 via-white to-cyan-200 bg-clip-text text-transparent">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-400 mt-2 text-center max-w-xs">
              {subtitle}
            </p>
          )}
        </div>

        <div className="relative rounded-2xl border border-cyan-400/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-cyan-500/10 p-6 sm:p-8">
          {/* Subtle border glow */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.08), transparent 40%, transparent 60%, rgba(34,211,238,0.08))',
            }}
          />
          <div className="relative">{children}</div>
        </div>

        {footer && (
          <p className="text-center text-sm text-slate-400 mt-6">{footer}</p>
        )}
      </motion.div>
    </div>
  );
}

function BackgroundDecor() {
  return (
    <>
      {/* Base radial gradient */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(8,145,178,0.25), transparent 50%),' +
            'radial-gradient(ellipse at bottom, rgba(20,184,166,0.18), transparent 50%)',
        }}
      />

      {/* Drifting orbs */}
      <motion.div
        aria-hidden="true"
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.18), transparent 70%)' }}
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(125,211,252,0.12), transparent 70%)' }}
        animate={{ x: [0, -20, 0], y: [0, -25, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Faint circuit grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.5) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(34,211,238,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
    </>
  );
}
