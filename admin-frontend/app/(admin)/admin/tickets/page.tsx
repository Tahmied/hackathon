'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles, StickyNote, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api, apiErrorMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from 'next-auth/react';
import { formatBdt, formatDateTime } from '@/lib/types';
import type { AdminTicketView, TicketContext } from '@/lib/admin-types';
import { cn } from '@/lib/utils';

export default function TicketsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [asNote, setAsNote] = useState(false);

  const tickets = useQuery({
    queryKey: ['admin', 'tickets'],
    queryFn: async () =>
      (await api.get('/tickets?limit=50')).data.data.tickets as AdminTicketView[],
    refetchInterval: 10000,
  });

  const thread = useQuery({
    queryKey: ['admin', 'ticket', selectedId],
    queryFn: async () => (await api.get(`/tickets/${selectedId}`)).data.data.ticket as AdminTicketView,
    enabled: !!selectedId,
  });

  const context = useQuery({
    queryKey: ['admin', 'ticket-context', selectedId],
    queryFn: async () => (await api.get(`/tickets/${selectedId}/context`)).data.data as TicketContext,
    enabled: !!selectedId,
  });

  const summary = useQuery({
    queryKey: ['admin', 'ticket-summary', selectedId],
    queryFn: async () => (await api.get(`/ai/summarize/ticket/${selectedId}`)).data.data.summary as {
      available: boolean;
      reason?: string;
      bullets: string[];
      sentiment: string | null;
    },
    enabled: !!selectedId,
  });

  async function send() {
    if (!selectedId || !reply.trim()) return;
    try {
      await api.post(`/tickets/${selectedId}/messages`, {
        body: reply,
        isInternalNote: asNote && can(session?.user, 'tickets:notes'),
      });
      setReply('');
      toast.success(asNote ? 'Internal note added' : 'Reply sent');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function setStatus(status: string) {
    try {
      await api.post(`/tickets/${selectedId}/status`, { status });
      toast.success(`Ticket ${status.toLowerCase()}`);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const visibleTickets = (tickets.data ?? []).filter(
    (t) => t.status === 'OPEN' || t.status === 'PENDING',
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ticket management</h1>
        <p className="text-sm text-muted-foreground">
          Each ticket shows the user&apos;s recent transactions and trades for context.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Queue */}
        <div className="space-y-2">
          {visibleTickets.map((t) => (
            <button
              key={t._id}
              onClick={() => setSelectedId(t._id)}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition',
                selectedId === t._id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{t.subject}</p>
                <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.userId?.name} · {formatDateTime(t.updatedAt)}
              </p>
            </button>
          ))}
          {visibleTickets.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No open tickets 🎉
              </CardContent>
            </Card>
          )}
        </div>

        {/* Thread + context */}
        {selectedId ? (
          <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
            <Card className="flex min-h-[420px] flex-col">
              <CardHeader className="border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{thread.data?.subject}</CardTitle>
                  <div className="flex gap-2">
                    {can(session?.user, 'tickets:close') && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => void setStatus('RESOLVED')}>
                          Resolve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void setStatus('CLOSED')}>
                          Close
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {summary.data && (
                  <div className="mt-2 rounded-lg bg-background/50 p-2 text-xs">
                    <p className="mb-1 flex items-center gap-1 font-medium text-muted-foreground">
                      <Sparkles className="h-3 w-3 text-primary" /> AI summary
                    </p>
                    {summary.data.available ? (
                      <>
                        {summary.data.bullets.map((b, i) => (
                          <p key={i}>• {b}</p>
                        ))}
                        {summary.data.sentiment && (
                          <p className="mt-1 text-muted-foreground">Sentiment: {summary.data.sentiment}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">⚙️ AI Service Unavailable. Manual review required.</p>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1 space-y-3 overflow-y-auto py-4">
                {(thread.data?.messages ?? []).map((m, i) => (
                  <div key={i} className={cn('flex flex-col', m.senderRole === 'user' ? 'items-start' : 'items-end')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                        m.isInternalNote
                          ? 'border border-warning/40 bg-warning/10 text-warning'
                          : m.senderRole === 'user'
                            ? 'rounded-bl-md bg-accent'
                            : 'rounded-br-md bg-primary text-primary-foreground',
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      {m.senderName} ({m.senderRole}) · {formatDateTime(m.createdAt)}
                      {m.isInternalNote && ' · internal'}
                    </span>
                  </div>
                ))}
              </CardContent>
              <div className="space-y-2 border-t border-border p-3">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder={asNote ? 'Internal note (only staff can see this)…' : 'Reply to the user…'}
                />
                <div className="flex items-center justify-between">
                  {can(session?.user, 'tickets:notes') && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={asNote} onChange={(e) => setAsNote(e.target.checked)} />
                      <StickyNote className="h-3.5 w-3.5" /> Internal note
                    </label>
                  )}
                  <Button size="sm" onClick={() => void send()} disabled={!reply.trim()}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Send
                  </Button>
                </div>
              </div>
            </Card>

            {/* Context sidebar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">User context</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {context.data?.user?.name} · KYC {context.data?.user?.kycStatus}
                </p>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div>
                  <p className="mb-1.5 font-semibold text-muted-foreground">Recent transactions</p>
                  {(context.data?.transactions ?? []).map((tx) => (
                    <div key={tx._id} className="flex items-center justify-between border-b border-border/50 py-1.5">
                      <span>{tx.type === 'DEPOSIT' ? '↓' : '↑'} {formatBdt(tx.amountBdt)}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px]',
                          tx.status === 'APPROVED' && 'border-profit/40 text-profit',
                          tx.status === 'REJECTED' && 'border-loss/40 text-loss',
                          (tx.status === 'PENDING' || tx.status === 'CONFLICT') && 'border-warning/40 text-warning',
                        )}
                      >
                        {tx.status}
                      </Badge>
                    </div>
                  ))}
                  {(context.data?.transactions ?? []).length === 0 && (
                    <p className="text-muted-foreground">None</p>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 font-semibold text-muted-foreground">Recent trades</p>
                  {(context.data?.trades ?? []).map((t) => (
                    <div key={t._id} className="flex items-center justify-between border-b border-border/50 py-1.5">
                      <span>{t.side} {t.symbol} · {formatBdt(t.margin / 100)}</span>
                      <span className={cn('font-mono', (t.pnl ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>
                        {t.status === 'CLOSED' ? `${t.pnl != null ? formatBdt(t.pnl / 100) : ''}` : 'OPEN'}
                      </span>
                    </div>
                  ))}
                  {(context.data?.trades ?? []).length === 0 && (
                    <p className="text-muted-foreground">None</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="flex min-h-[420px] items-center justify-center">
            <CardContent className="text-sm text-muted-foreground">Select a ticket</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
