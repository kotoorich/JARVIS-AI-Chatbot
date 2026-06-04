import ReactMarkdown from 'react-markdown';
import CodeBlock from './CodeBlock';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { preserveLineBreaks } from '@/lib/markdown';

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="py-5"
    >
      <div className="max-w-3xl mx-auto px-4 flex gap-4">
        {!isUser && (
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-primary-foreground text-xs font-bold">J</span>
          </div>
        )}
        <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
          {isUser ? (
            <div className="inline-block bg-muted rounded-2xl px-4 py-3 max-w-[85%]">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
              <ReactMarkdown
                components={{
                  code({ inline, className, children }) {
                    const match = /language-(\w+)/.exec(className || '');
                    if (!inline && (match || String(children).includes('\n'))) {
                      return (
                        <CodeBlock
                          code={String(children).replace(/\n$/, '')}
                          language={match?.[1] || ''}
                        />
                      );
                    }
                    return (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                        {children}
                      </code>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-3 last:mb-0 leading-relaxed text-sm">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="mb-3 ml-5 list-disc space-y-1 text-sm">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="mb-3 ml-5 list-decimal space-y-1 text-sm">{children}</ol>;
                  },
                  h1({ children }) {
                    return <h1 className="text-xl font-bold mt-5 mb-3">{children}</h1>;
                  },
                  h2({ children }) {
                    return <h2 className="text-lg font-bold mt-4 mb-2">{children}</h2>;
                  },
                  h3({ children }) {
                    return <h3 className="text-base font-semibold mt-3 mb-2">{children}</h3>;
                  },
                  strong({ children }) {
                    return <strong className="font-semibold">{children}</strong>;
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-3 border-primary pl-4 my-3 text-muted-foreground italic">
                        {children}
                      </blockquote>
                    );
                  },
                  a({ href, children }) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {preserveLineBreaks(message.content)}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {isUser && (
          <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
            <User className="h-4 w-4 text-accent-foreground" />
          </div>
        )}
      </div>
    </motion.div>
  );
}