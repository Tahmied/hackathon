'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { MessageCircle, X, Send, Volume2, VolumeX, UsersRound } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import type { ChatMessageView, ConversationView } from '@/lib/types';

interface InboxRow extends ConversationView {
  user?: { _id?: string; name?: string; email?: string; kycStatus?: string };
}

/** WebAudio ping — no audio asset needed. */
function playPing() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio blocked — ignore */
  }
}

/** HTTP-loaded messages carry `_id`; socket events carry `id`. Normalize both. */
function normalizeMessage(m: ChatMessageView & { _id?: string }): ChatMessageView {
  return { ...m, id: m.id ?? m._id ?? crypto.randomUUID() };
}

export function AdminChatWidget() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<InboxRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  const canJoin = can(session?.user, 'chat:join');

  const loadInbox = useCallback(async () => {
    if (!can(session?.user, 'chat:read')) return;
    try {
      const res = await api.get('/chat/inbox');
      const rows = res.data.data.conversations as InboxRow[];
      setConversations(rows);
      setTotalUnread(rows.reduce((s, c) => s + (c.unreadForStaff ?? 0), 0));
    } catch {
      /* silent */
    }
  }, [session?.user]);

  useEffect(() => {
    void loadInbox();
    const interval = setInterval(() => void loadInbox(), 15000);
    return () => clearInterval(interval);
  }, [loadInbox]);

  // Realtime: new message notifications + live thread updates
  useEffect(() => {
    if (!session?.user) return;
    let cleanup: (() => void) | undefined;
    getSocket()
      .then((socket) => {
        const onNotify = (payload: { conversationId: string; from: string; preview: string }) => {
          if (soundRef.current) playPing();
          toast(`💬 ${payload.from}: ${payload.preview.slice(0, 80)}`, {
            description: 'New chat message from a user',
          });
          void loadInbox();
        };
        const onConversation = () => void loadInbox();
        const onMessage = (msg: ChatMessageView) => {
          if (msg.conversationId === activeId) {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, normalizeMessage(msg as ChatMessageView & { _id?: string })],
            );
          }
        };
        socket.on('chat:notify', onNotify);
        socket.on('conversation:new', onConversation);
        socket.on('conversation:updated', onConversation);
        socket.on('chat:message', onMessage);
        // chat rooms are per-connection — rejoin the open thread after reconnect
        const rejoin = () => {
          if (activeIdRef.current) socket.emit('chat:join', activeIdRef.current);
        };
        socket.on('connect', rejoin);
        cleanup = () => {
          socket.off('chat:notify', onNotify);
          socket.off('conversation:new', onConversation);
          socket.off('conversation:updated', onConversation);
          socket.off('chat:message', onMessage);
          socket.off('connect', rejoin);
        };
      })
      .catch(() => undefined);
    return () => cleanup?.();
  }, [session?.user, activeId, loadInbox]);

  const openThread = async (conversationId: string) => {
    setActiveId(conversationId);
    try {
      // Join the socket room so live messages stream into the open thread
      getSocket()
        .then((socket) => socket.emit('chat:join', conversationId))
        .catch(() => undefined);
      const res = await api.get(`/chat/${conversationId}/messages`);
      setMessages(
        (res.data.data.messages as (ChatMessageView & { _id?: string })[]).map(normalizeMessage),
      );
      await api.post(`/chat/${conversationId}/read`);
      void loadInbox();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  async function send() {
    if (!input.trim() || !activeId) return;
    const body = input.trim();
    const convId = activeId;
    setInput('');
    try {
      const res = await api.post(`/chat/${convId}/messages`, { body });
      const { messageId } = res.data.data as { messageId: string };
      // Show own reply immediately — never depend on the socket echo
      setMessages((prev) =>
        prev.some((m) => m.id === messageId)
          ? prev
          : [
              ...prev,
              {
                id: messageId,
                conversationId: convId,
                senderType: 'AGENT' as const,
                senderName: session?.user?.name ?? 'Support',
                body,
                createdAt: new Date().toISOString(),
              },
            ],
      );
      void loadInbox();
    } catch (err) {
      // The request may have reached the server before the connection dropped —
      // re-sync the thread instead of losing the reply.
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const res = await api.get(`/chat/${convId}/messages`);
        const loaded = (res.data.data.messages as (ChatMessageView & { _id?: string })[]).map(
          normalizeMessage,
        );
        setMessages(loaded);
        const cameThrough = loaded.some((m) => m.senderType === 'AGENT' && m.body === body);
        if (!cameThrough) toast.error(apiErrorMessage(err));
      } catch {
        toast.error(apiErrorMessage(err));
      }
    }
  }

  if (!can(session?.user, 'chat:read')) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition hover:scale-105"
          aria-label="Open support inbox"
        >
          <MessageCircle className="h-6 w-6" />
          {totalUnread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-loss px-1 text-xs font-bold">
              {totalUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[440px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Inbox list */}
          <div
            className={cn(
              'flex w-48 shrink-0 flex-col border-r border-border',
              activeId && 'hidden md:flex',
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
              <span className="text-sm font-semibold">Inbox</span>
              <button onClick={() => setSoundOn((s) => !s)} title={soundOn ? 'Sound on' : 'Sound off'}>
                {soundOn ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 && (
                <p className="p-4 text-center text-xs text-muted-foreground">No active conversations</p>
              )}
              {conversations.map((c) => (
                <button
                  key={c._id}
                  onClick={() => void openThread(c._id)}
                  className={cn(
                    'w-full border-b border-border/60 px-3 py-2.5 text-left hover:bg-accent',
                    activeId === c._id && 'bg-accent',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-medium">{c.user?.name ?? 'User'}</span>
                    {(c.unreadForStaff ?? 0) > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">
                        {c.unreadForStaff}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {c.channel === 'AI' ? '🤖 AI chat' : '👤 Human'} · {c.lastMessage?.slice(0, 24) ?? '—'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Thread */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
              <div className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-muted-foreground" />
                <span className="truncate text-sm font-medium">
                  {conversations.find((c) => c._id === activeId)?.user?.name ?? 'Select conversation'}
                </span>
                {activeId && (
                  <Badge variant="outline" className="text-[10px]">
                    {conversations.find((c) => c._id === activeId)?.channel === 'AI' ? 'AI chat' : 'Human'}
                  </Badge>
                )}
              </div>
              <button onClick={() => { setOpen(false); setActiveId(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {activeId ? (
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
                  <div className="space-y-2.5">
                    {messages.map((m) => (
                      <div key={m.id} className={cn('flex flex-col', m.senderType === 'USER' ? 'items-start' : 'items-end')}>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3 py-2 text-xs',
                            m.senderType === 'USER'
                              ? 'rounded-bl-md bg-accent'
                              : m.senderType === 'SYSTEM'
                                ? 'bg-background text-muted-foreground'
                                : 'rounded-br-md bg-primary text-primary-foreground',
                          )}
                        >
                          <p className="mb-0.5 text-[10px] opacity-70">{m.senderName}</p>
                          {m.body}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {canJoin ? (
                  <div className="flex gap-2 border-t border-border p-3">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && send()}
                      placeholder="Reply as support…"
                    />
                    <Button size="icon" onClick={send} disabled={!input.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">
                    You don&apos;t have chat:join permission — read only
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                Select a conversation
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
