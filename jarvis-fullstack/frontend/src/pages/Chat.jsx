import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import EmptyState from '../components/EmptyState';
import TypingIndicator from '../components/TypingIndicator';
import ShareChatButton from '../components/ShareChatButton';
import api from '@/api/Client';

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ?prompt= pre-fills the composer once (e.g. from clicking a module
  // question). We consume it on first read and clear the URL so a refresh
  // doesn't keep re-injecting it.
  const [initialPrompt, setInitialPrompt] = useState('');
  useEffect(() => {
    const p = searchParams.get('prompt');
    if (p) {
      setInitialPrompt(p);
      searchParams.delete('prompt');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Messages added during THIS session (not yet round-tripped through the
  // server query). Keyed by conversationId so switching conversations
  // resets them automatically without any syncing effect.
  const [localByConv, setLocalByConv] = useState({});
  const [isWaiting, setIsWaiting] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [connected, setConnected] = useState(false);

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const streamRef = useRef('');
  const convIdRef = useRef(conversationId);
  const pendingRef = useRef([]);
  const reconnectRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => { convIdRef.current = conversationId; }, [conversationId]);

  // Server-loaded history for this conversation.
  const { data: serverMessages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await api.get(`/api/conversations/${conversationId}/messages`);
      return res.data.map((m) => ({ role: m.role, content: m.content, id: m.id }));
    },
    enabled: !!conversationId,
    // Don't refetch on window focus — it would cause flashing during streaming.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // The displayed messages: server history followed by anything we added
  // locally this session that the server hasn't yet returned. No effect, no
  // sync, no loop — just a derived value.
  const messages = useMemo(() => {
    const base = serverMessages || [];
    const local = localByConv[conversationId || 'new'] || [];
    return [...base, ...local];
  }, [serverMessages, localByConv, conversationId]);

  // Append a message to the local-only list for the current conversation.
  const appendLocal = (msg) => {
    const key = convIdRef.current || 'new';
    setLocalByConv((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), msg],
    }));
  };

  // ---- WebSocket: connect once, auto-reconnect, queue messages ----
  useEffect(() => {
    mountedRef.current = true;

    const flushQueue = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      while (pendingRef.current.length) {
        ws.send(JSON.stringify(pendingRef.current.shift()));
      }
    };

    const connect = () => {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const ws = new WebSocket(`${WS_BASE}/ws/chat?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        flushQueue();
      };

      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.conversation_id && !data.done && !data.chunk) {
          // Backend created a new conversation for us. Move our pending
          // local messages from the "new" key to the real conversation id,
          // then navigate.
          const newId = String(data.conversation_id);
          setLocalByConv((prev) => {
            if (!prev.new || !prev.new.length) return prev;
            const merged = [...(prev[newId] || []), ...prev.new];
            const { new: _drop, ...rest } = prev;
            return { ...rest, [newId]: merged };
          });
          if (!convIdRef.current) {
            navigate(`/chat/${data.conversation_id}`, { replace: true });
          }
        } else if (data.chunk) {
          streamRef.current += data.chunk;
          setStreamingMessage(streamRef.current);
          setIsWaiting(false);
        } else if (data.done) {
          const finalContent = streamRef.current;
          if (finalContent) {
            appendLocal({ role: 'assistant', content: finalContent });
          }
          streamRef.current = '';
          setStreamingMessage('');
          setIsWaiting(false);
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        } else if (data.error) {
          console.error('Chat error:', data.error);
          setIsWaiting(false);
          streamRef.current = '';
          setStreamingMessage('');
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 1500);
      };

      ws.onerror = () => { try { ws.close(); } catch (_) {} };
    };

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectRef.current);
      try { wsRef.current?.close(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, isWaiting]);

  const handleSend = (content) => {
    const text = (content || '').trim();
    if (!text) return;

    appendLocal({ role: 'user', content: text });
    setIsWaiting(true);
    streamRef.current = '';
    setStreamingMessage('');

    const payload = {
      message: text,
      conversation_id: convIdRef.current ? parseInt(convIdRef.current, 10) : null,
    };

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      pendingRef.current.push(payload);
    }
  };

  const showEmpty = messages.length === 0 && !isWaiting && !streamingMessage;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50">
          <span className="text-[11px] text-muted-foreground">
            {connected ? '● Connected' : '○ Connecting…'}
          </span>
          <ShareChatButton messages={messages} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {showEmpty ? (
          <EmptyState onPromptClick={handleSend} />
        ) : (
          <div className="pb-4">
            {messages.map((msg, idx) => (
              <ChatMessage key={msg.id ?? `local-${idx}`} message={msg} />
            ))}
            {streamingMessage && (
              <ChatMessage message={{ role: 'assistant', content: streamingMessage }} />
            )}
            {isWaiting && !streamingMessage && (
              <div className="py-5">
                <div className="max-w-3xl mx-auto px-4">
                  <TypingIndicator />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <ChatInput onSend={handleSend} disabled={isWaiting} initialValue={initialPrompt} />
    </div>
  );
}
