import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export default function ChatInput({ onSend, disabled, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef(null);

  // If the parent provides a new initial value (e.g. from a URL ?prompt=…),
  // populate the field and focus it. Empty values do nothing — we don't want
  // to wipe what the user is typing.
  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      // Focus on the next tick so layout effects don't fight us.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [initialValue]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="sticky bottom-0 bg-background/80 backdrop-blur-sm p-3 md:p-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end bg-muted rounded-2xl border border-border focus-within:border-ring/40 transition-colors px-4 py-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message JARVIS..."
            className="flex-1 bg-transparent resize-none outline-none text-sm max-h-[200px] min-h-[24px] leading-relaxed font-inter placeholder:text-muted-foreground"
            rows={1}
            disabled={disabled}
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className="ml-2 p-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all shrink-0"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[11px] text-center text-muted-foreground mt-2.5">
          JARVIS AI may produce inaccurate information. Consider verifying important details.
        </p>
      </div>
    </div>
  );
}