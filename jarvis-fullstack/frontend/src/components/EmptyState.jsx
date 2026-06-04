import { Calculator, FlaskConical, Globe, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

const suggestions = [
  { icon: Calculator, text: "What is 12 × 8 + 5?" },
  { icon: FlaskConical, text: "Explain photosynthesis" },
  { icon: Globe, text: "How many continents are there?" },
  { icon: BookOpen, text: "What is a metaphor?" },
];

export default function EmptyState({ onPromptClick }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-5">
          <span className="text-2xl font-bold text-primary">J</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">How can I help you today?</h1>
        <p className="text-muted-foreground text-sm">Ask JARVIS anything — from coding to creative writing.</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 + i * 0.06 }}
            onClick={() => onPromptClick(s.text)}
            className="flex items-start gap-3 p-4 rounded-xl border border-border hover:bg-muted/60 transition-colors text-left group"
          >
            <s.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 group-hover:text-primary transition-colors" />
            <span className="text-sm text-foreground">{s.text}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}