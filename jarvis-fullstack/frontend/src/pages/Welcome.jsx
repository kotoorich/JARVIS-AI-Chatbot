import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Send, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import api from '@/api/Client';

/**
 * First-login onboarding. A scripted chat exchange between Jarvis and the
 * user that introduces the assistant. The user must type the exact phrase
 * Jarvis asks for before the Continue button activates. A Skip option is
 * always available.
 *
 * This exchange is ephemeral — it lives only on this screen and is NOT
 * persisted to the user's conversation history. The first real
 * conversation starts when they enter the main app.
 *
 * After Continue or Skip, we POST /api/users/me/welcome-seen so the page
 * never shows again for this account.
 */

// The exact phrase Jarvis asks the user to type. Matching is case-insensitive
// and ignores trailing punctuation / surrounding whitespace.
const REQUIRED_PHRASE = "Who are you, Jarvis?";

// What Jarvis replies once the user sends the correct phrase. Hardcoded so
// it's polished, consistent across users, and doesn't cost an LLM call on
// every first login.
const JARVIS_INTRO = `I'm Jarvis — your AI assistant on this platform.

I'm here to help you with anything you're working on: answering questions, drafting and refining writing, explaining tricky concepts, planning projects, brainstorming, summarising documents, working through code, and more.

A few quick things you can try:

- Ask me a question in plain English.
- Open the **Modules** section (if your admin has set them up) for curated answers on specific topics.
- Open **Settings** to customise your profile, theme, and notifications.
- Use the **bell icon** at the top to see updates from the platform.

Whenever you're ready, click **Continue** and let's get started.`;

const JARVIS_NUDGE = `Almost! Please type the phrase exactly as I asked:\n\n**"Who are you, Jarvis?"**`;

function normalize(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:]+$/g, '')  // strip trailing punctuation
    .replace(/\s+/g, ' ');         // collapse internal whitespace
}

const REQUIRED_NORMALIZED = normalize(REQUIRED_PHRASE);

export default function Welcome() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  // The scripted chat. Each entry: { id, role: 'jarvis' | 'user', text }.
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Already onboarded? Bounce.
  useEffect(() => {
    if (user?.welcome_seen) {
      navigate('/chat', { replace: true });
    }
  }, [user?.welcome_seen, navigate]);

  // Seed Jarvis's opening message after a short delay so it feels natural.
  useEffect(() => {
    const t = setTimeout(() => {
      setMessages([{
        id: 'j-1',
        role: 'jarvis',
        text: `Hello, welcome! I am Jarvis, your AI assistant. Before we begin, please type:\n\n**"${REQUIRED_PHRASE}"**`,
      }]);
      // Focus the input shortly after the opening lands
      setTimeout(() => inputRef.current?.focus(), 400);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const markSeen = async () => {
    try {
      await api.post('/api/users/me/welcome-seen');
      await refreshUser();
    } catch {
      // Non-fatal
    }
  };

  const handleSkip = async () => {
    setLeaving(true);
    await markSeen();
    navigate('/chat', { replace: true });
  };

  const handleContinue = async () => {
    setLeaving(true);
    await markSeen();
    navigate('/chat', { replace: true });
  };

  const handleSend = (e) => {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || thinking || unlocked) return;
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setInput('');

    // Show a brief typing indicator before Jarvis "replies"
    setThinking(true);
    const ok = normalize(text) === REQUIRED_NORMALIZED;
    const delay = 700 + Math.random() * 300;
    setTimeout(() => {
      setThinking(false);
      if (ok) {
        setMessages((m) => [...m, { id: `j-${Date.now()}`, role: 'jarvis', text: JARVIS_INTRO }]);
        setUnlocked(true);
      } else {
        setMessages((m) => [...m, { id: `j-${Date.now()}`, role: 'jarvis', text: JARVIS_NUDGE }]);
      }
    }, delay);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-slate-100 relative overflow-hidden">
      <BackgroundSparkles />

      {/* Top bar with Skip */}
      <div className="relative flex items-center justify-between px-4 sm:px-6 py-4 z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-cyan-300" />
          </div>
          <span className="font-semibold text-sm tracking-tight">JARVIS</span>
        </div>
        <button
          onClick={handleSkip}
          disabled={leaving}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          Skip <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Chat area — centered card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-4 relative z-10">
        <div className="w-full max-w-2xl rounded-2xl bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 shadow-2xl overflow-hidden flex flex-col"
             style={{ height: 'min(80vh, 640px)' }}>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {thinking && <TypingBubble key="typing" />}
            </AnimatePresence>
          </div>

          {/* Composer */}
          <form onSubmit={handleSend} className="border-t border-slate-700/50 px-4 sm:px-6 py-3 flex items-center gap-2 bg-slate-900/40">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={unlocked ? 'Click Continue when ready' : 'Type your message…'}
              disabled={unlocked || thinking || leaving}
              maxLength={300}
              autoComplete="off"
              className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 outline-none text-sm py-2 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking || unlocked || leaving}
              aria-label="Send"
              className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          {/* Continue button */}
          <div className="border-t border-slate-700/50 px-4 sm:px-6 py-3 bg-slate-900/40 flex justify-end">
            <button
              onClick={handleContinue}
              disabled={!unlocked || leaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-semibold text-sm shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Single message bubble. Markdown-lite: bold (**...**) only, line breaks
 * preserved. We deliberately don't pull in react-markdown here to keep
 * the bundle slim. */
function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-cyan-500 text-slate-950 rounded-tr-sm'
            : 'bg-slate-800/80 text-slate-100 rounded-tl-sm'
        }`}
      >
        {renderInline(message.text)}
      </div>
    </motion.div>
  );
}

function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex justify-start"
    >
      <div className="h-7 w-7 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
      </div>
      <div className="bg-slate-800/80 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '300ms' }} />
      </div>
    </motion.div>
  );
}

/** Tiny inline markdown: render **bold** as <strong>. Keeps it dependency-free.
 * Returns an array of React nodes preserving line breaks via whitespace-pre-wrap. */
function renderInline(text) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

/** Twinkling background. */
function BackgroundSparkles() {
  const sparks = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: 2 + Math.random() * 3,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 3,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none">
      {sparks.map((s) => (
        <motion.div
          key={s.id}
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
          }}
          className="absolute rounded-full bg-cyan-300/50"
          animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: s.duration, repeat: Infinity, delay: s.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
