'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Bot, Headphones, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChatMessageView, ConversationView } from '@/lib/types';

type Tab = 'ai' | 'human';

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('ai');
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<ConversationView | null>(null);
  conversationRef.current = conversation;

  const normalizeLoaded = (msgs: (ChatMessageView & { _id?: string })[]): ChatMessageView[] =>
    msgs.map((m) => ({ ...m, id: m.id ?? m._id ?? crypto.randomUUID() }));

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, aiThinking, open, tab]);

  const loadConversation = useCallback(async (channel: Tab, isRetry = false) => {
    try {
      const res = await api.post('/chat/start', { channel: channel === 'ai' ? 'AI' : 'HUMAN' });
      const conv = res.data.data.conversation;
      setConversation(conv);
      const msgRes = await api.get(`/chat/${conv._id}/messages`);
      const loaded = (msgRes.data.data.messages as (ChatMessageView & { _id?: string })[]).map(
        (m) => ({ ...m, id: m.id ?? m._id ?? crypto.randomUUID() }),
      );
      setMessages(loaded);
    } catch (err) {
      // The backend hot-reloads during development — retry once before giving up
      if (!isRetry) {
        await new Promise((r) => setTimeout(r, 1500));
        return loadConversation(channel, true);
      }
      toast.error(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (open && !conversation) loadConversation(tab);
  }, [open, conversation, tab, loadConversation]);

  // Realtime incoming messages
  useEffect(() => {
    if (!open || !conversation) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const wire = async (attempt: number): Promise<void> => {
      if (cancelled) return;
      try {
        const socket = await getSocket();
        if (cancelled) return;
        const join = () => socket.emit('chat:join', conversation._id);
        join();
        // rooms are per-connection — rejoin after any reconnect
        socket.on('connect', join);
        const onMessage = (msg: ChatMessageView) => {
          if (msg.conversationId !== conversation._id) return;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
          if (msg.senderType === 'AI') setAiThinking(false);
        };
        socket.on('chat:message', onMessage);
        cleanup = () => {
          socket.off('chat:message', onMessage);
          socket.off('connect', join);
        };
      } catch {
        // backend restarting or token rotating — retry a few times
        if (attempt < 4) {
          setTimeout(() => void wire(attempt + 1), 2000);
        }
      }
    };
    void wire(0);

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [open, conversation]);

  async function send() {
    if (!input.trim() || !conversation || sending) return;
    const body = input.trim();
    const convId = conversation._id;
    setInput('');
    setSending(true);
    try {
      const res = await api.post(`/chat/${convId}/messages`, { body });
      const { messageId } = res.data.data as { messageId: string };
      // Show own message immediately — never depend on the socket echo
      setMessages((prev) =>
        prev.some((m) => m.id === messageId)
          ? prev
          : [
              ...prev,
              {
                id: messageId,
                conversationId: convId,
                senderType: 'USER' as const,
                senderName: 'You',
                body,
                createdAt: new Date().toISOString(),
              },
            ],
      );
      setAiThinking(conversation.channel === 'AI' && conversation.status === 'BOT');
      setSending(false);
    } catch (err) {
      // The request may have reached the server before the connection dropped —
      // re-sync the thread from the server instead of losing the message.
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const res = await api.get(`/chat/${convId}/messages`);
        const loaded = normalizeLoaded(res.data.data.messages);
        setMessages(loaded);
        const cameThrough = loaded.some((m) => m.senderType === 'USER' && m.body === body);
        if (!cameThrough) toast.error(apiErrorMessage(err));
      } catch {
        toast.error(apiErrorMessage(err));
      }
      setSending(false);
    }
  }

  async function escalate() {
    if (!conversation) return;
    try {
      await api.post(`/chat/${conversation._id}/escalate`);
      setConversation({ ...conversation, status: 'HUMAN', channel: 'HUMAN' });
      toast('Connecting you to a human support agent…');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function switchTab(next: Tab) {
    setTab(next);
    setConversation(null);
    setMessages([]);
    if (open) loadConversation(next);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition hover:scale-105 md:bottom-6"
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-loss text-[10px] font-bold">
          AI
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Nova AI Assistant</p>
            <p className="text-[11px] text-muted-foreground">
              {conversation?.status === 'HUMAN' ? 'Live support connected' : 'Market & account help'}
            </p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm">
        <button
          onClick={() => switchTab('ai')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 font-medium',
            tab === 'ai' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" /> AI chat
        </button>
        <button
          onClick={() => switchTab('human')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 font-medium',
            tab === 'human' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground',
          )}
        >
          <Headphones className="h-3.5 w-3.5" /> Live support
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {tab === 'ai' ? (
              <>
                <p className="mb-2 font-medium text-foreground">Ask me anything about your account</p>
                <p>&quot;Why is my balance low?&quot; · &quot;Where is my reserved money?&quot; · &quot;Show BTC price&quot;</p>
              </>
            ) : (
              'Start the conversation — a support agent will join shortly.'
            )}
          </div>
        )}
        {messages.map((m) => {
          if (m.senderType === 'SYSTEM') {
            return (
              <div key={m.id} className="text-center text-xs text-muted-foreground">
                {m.body}
              </div>
            );
          }
          const isUser = m.senderType === 'USER';
          return (
            <div key={m.id} className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                  isUser
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md bg-accent text-accent-foreground',
                  m.aiUnavailable && 'border border-warning/50',
                )}
              >
                {m.body}
                {m.aiUnavailable && (
                  <p className="mt-1 text-[11px] text-warning">
                    AI is offline — please use Live support.
                  </p>
                )}
              </div>
              {!isUser && m.toolTrace && m.toolTrace.length > 0 && (
                <details className="mt-1 w-full">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                    🤖 AI reasoning ({m.toolTrace.length} step{m.toolTrace.length > 1 ? 's' : ''})
                  </summary>
                  <div className="mt-1 space-y-1.5 rounded-lg border border-border/60 bg-background/40 p-2">
                    {m.toolTrace.map((t, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground">
                        {t.thought && <p className="italic">&ldquo;{t.thought}&rdquo;</p>}
                        {t.tool && (
                          <p className="font-mono text-primary">
                            → {t.tool}() {t.resultSummary ? `· ${t.resultSummary}` : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
        {aiThinking && (
          <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-accent px-3.5 py-2.5 w-fit">
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
          </div>
        )}
      </div>

      {/* Escalate */}
      {conversation?.channel === 'AI' && conversation.status === 'BOT' && messages.length > 0 && (
        <button
          onClick={escalate}
          className="flex items-center justify-center gap-1 border-t border-border py-2 text-xs text-muted-foreground hover:text-primary"
        >
          Talk to a human instead <ChevronRight className="h-3 w-3" />
        </button>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Type a message…"
          disabled={sending}
        />
        <Button size="icon" onClick={send} disabled={!input.trim() || sending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
