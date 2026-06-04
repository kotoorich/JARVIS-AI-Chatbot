import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Code2, FileText, MessageSquare, Zap, Shield, Globe } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import useTheme from '@/hooks/useTheme';
import JarvisLogo from '@/components/JarvisLogo';
import { useState, useEffect, useRef } from 'react';

const TYPEWRITER_PHRASES = ['Write better.', 'Code faster.', 'Think deeper.', 'Create more.'];

function TypewriterText() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const phrase = TYPEWRITER_PHRASES[phraseIdx];
    if (!deleting && displayed.length < phrase.length) {
      const t = setTimeout(() => setDisplayed(phrase.slice(0, displayed.length + 1)), 60);
      return () => clearTimeout(t);
    } else if (!deleting && displayed.length === phrase.length) {
      const t = setTimeout(() => setDeleting(true), 1800);
      return () => clearTimeout(t);
    } else if (deleting && displayed.length > 0) {
      const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 35);
      return () => clearTimeout(t);
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setPhraseIdx((i) => (i + 1) % TYPEWRITER_PHRASES.length);
    }
  }, [displayed, deleting, phraseIdx]);
  return <span className="text-primary">{displayed}<span className="animate-pulse">|</span></span>;
}

function FloatingParticles() {
  const particles = Array.from({ length: 20 }, (_, i) => i);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-cyan-400/30"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30 - Math.random() * 40, 0],
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: 3 + Math.random() * 4,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

const demoMessages = [
  { role: 'user', text: 'Explain quantum entanglement simply.' },
  { role: 'ai', text: 'Imagine two coins that always land on opposite sides — no matter how far apart they are. Quantum entanglement works like that, but for particles.' },
  { role: 'user', text: 'Can you write Python code for that?' },
];

const features = [
  { icon: Code2, label: 'Code & Debug', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { icon: FileText, label: 'Write & Edit', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { icon: MessageSquare, label: 'Ask Anything', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { icon: Zap, label: 'Instant Results', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { icon: Shield, label: 'Private & Secure', color: 'text-green-400', bg: 'bg-green-500/10' },
  { icon: Globe, label: 'Always Available', color: 'text-pink-400', bg: 'bg-pink-500/10' },
];

export default function Home() {
  useTheme();
  return (
    <div className="min-h-screen bg-background text-foreground font-inter overflow-x-hidden flex flex-col">

      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full bg-violet-500/8 blur-[100px]" />
        <div className="absolute -bottom-20 left-1/3 w-[400px] h-[400px] rounded-full bg-cyan-500/6 blur-[80px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/70 border-b border-border/50">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 max-w-6xl mx-auto">
          <div className="flex items-center gap-2.5">
            <JarvisLogo size={36} />
            <span className="font-bold text-lg tracking-tight hidden sm:block">JARVIS AI</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link to="/login" className="text-sm font-medium hover:text-primary transition-colors px-2 md:px-3 py-2">
              Log in
            </Link>
            <Link
              to="/register"
              className="ml-1 text-sm font-semibold bg-primary text-primary-foreground px-3 md:px-4 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-md shadow-primary/30"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex-1 flex items-center justify-center px-4 md:px-6 py-16 md:py-24">
        <FloatingParticles />
        <div className="max-w-6xl mx-auto w-full grid md:grid-cols-2 gap-10 md:gap-12 items-center">
          {/* Left: copy */}
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold mb-6 tracking-wide">
              <Sparkles className="h-3 w-3" />
              AI-POWERED ASSISTANT
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.06] mb-5">
              Your AI that<br />helps you<br /><TypewriterText />
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8 max-w-md">
              JARVIS AI gives you an intelligent partner for every task — from complex code to creative writing — all in one seamless chat.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 md:px-7 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-xl shadow-primary/30 hover:shadow-primary/50"
              >
                Start for free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center px-6 md:px-7 py-3.5 border border-border rounded-xl font-medium text-sm hover:bg-muted transition-colors"
              >
                Log in
              </Link>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">No credit card required · Free to start</p>
          </motion.div>

          {/* Right: demo chat */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="hidden md:block"
          >
            <div className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/40">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400/60" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
                  <div className="h-3 w-3 rounded-full bg-green-400/60" />
                </div>
                <div className="flex items-center gap-1.5 mx-auto pr-12">
                  <JarvisLogo size={18} />
                  <span className="text-xs text-muted-foreground font-medium">JARVIS AI</span>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {demoMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.3 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'ai' && <JarvisLogo size={28} />}
                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                      msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="flex items-center gap-3">
                  <JarvisLogo size={28} />
                  <div className="flex gap-1 px-3.5 py-3 bg-muted rounded-xl rounded-tl-sm">
                    {[0,1,2].map(i => (
                      <motion.div key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                        animate={{ opacity: [0.3,1,0.3], scale: [0.85,1,0.85] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
                    ))}
                  </div>
                </motion.div>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3.5 py-2.5 border border-border">
                  <span className="text-xs text-muted-foreground flex-1">Message JARVIS...</span>
                  <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center">
                    <ArrowRight className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 md:px-6 py-16 md:py-20 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Capabilities</p>
            <h2 className="text-2xl md:text-4xl font-bold">One AI for everything</h2>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="group p-4 md:p-5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all"
              >
                <div className={`h-9 w-9 md:h-10 md:w-10 rounded-xl ${f.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <f.icon className={`h-4 w-4 md:h-5 md:w-5 ${f.color}`} />
                </div>
                <p className="font-semibold text-xs md:text-sm">{f.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* JARVIS Showcase */}
      <section className="relative px-4 md:px-6 py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-950/10 to-transparent pointer-events-none" />
        <FloatingParticles />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="flex justify-center mb-10"
          >
            <div className="relative">
              {/* Outer glow rings */}
              <motion.div
                className="absolute inset-0 rounded-full border border-cyan-400/20"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{ margin: '-20px' }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border border-cyan-400/15"
                animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                style={{ margin: '-40px' }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border border-cyan-400/10"
                animate={{ scale: [1, 2, 1], opacity: [0.2, 0, 0.2] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                style={{ margin: '-60px' }}
              />
              <JarvisLogo size={160} />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight">
              Meet <span className="text-cyan-400" style={{ textShadow: '0 0 30px rgba(34,211,238,0.5)' }}>JARVIS</span>
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto leading-relaxed mb-2">
              Just A Rather Very Intelligent System.
            </p>
            <p className="text-muted-foreground/60 text-sm max-w-md mx-auto">
              Powered by state-of-the-art AI — your personal Tony Stark experience.
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-6 py-16 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto relative rounded-3xl overflow-hidden"
        >
          <div className="absolute inset-0 bg-primary" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="relative text-center p-10 md:p-12">
            <JarvisLogo size={56} className="mx-auto mb-5" />
            <h2 className="text-2xl md:text-4xl font-bold text-primary-foreground mb-3">Ready to get started?</h2>
            <p className="text-primary-foreground/70 mb-8 text-base md:text-lg">Join thousands using JARVIS AI every day.</p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-7 md:px-8 py-3.5 bg-white text-primary rounded-xl font-bold text-sm hover:bg-white/90 transition-colors shadow-xl"
            >
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 md:px-6 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <JarvisLogo size={24} />
            <span className="text-xs font-semibold">JARVIS AI</span>
          </div>
          <span className="text-xs text-muted-foreground">© 2026 · Powered by advanced AI</span>
        </div>
      </footer>
    </div>
  );
}