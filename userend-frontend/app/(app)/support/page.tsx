'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LifeBuoy, MessageSquarePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TicketView {
  _id: string;
  subject: string;
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
  messages: { senderName: string; senderRole: string; body: string; isInternalNote?: boolean; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export default function SupportPage() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const tickets = useQuery({
    queryKey: ['tickets', 'mine'],
    queryFn: async () => (await api.get('/tickets/mine')).data.data.tickets as TicketView[],
    refetchInterval: 8000,
  });

  const selected = tickets.data?.find((t) => t._id === selectedId) ?? null;

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/tickets', { subject, body });
      toast.success('Ticket created — our team will respond soon');
      setSubject('');
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    try {
      await api.post(`/tickets/${selected._id}/messages`, { body: reply });
      setReply('');
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const statusColor: Record<TicketView['status'], string> = {
    OPEN: 'text-primary',
    PENDING: 'text-warning',
    RESOLVED: 'text-profit',
    CLOSED: 'text-muted-foreground',
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <h1 className="text-2xl font-bold">Support</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create tickets for detailed issues — or use the AI chat bubble for instant answers.
      </p>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Ticket list + creation */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquarePlus className="h-5 w-5 text-primary" /> New ticket
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createTicket} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="t-subject">Subject</Label>
                  <Input id="t-subject" required minLength={3} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-body">Details</Label>
                  <Textarea id="t-body" required minLength={5} rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe the issue…" />
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? 'Creating…' : 'Create ticket'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {(tickets.data ?? []).map((t) => (
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
                  <span className={cn('shrink-0 text-[11px] font-semibold', statusColor[t.status])}>{t.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(t.updatedAt)} · {t.messages.length} messages</p>
              </button>
            ))}
            {(tickets.data ?? []).length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <LifeBuoy className="h-8 w-8 text-muted-foreground/50" />
                  No tickets yet
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Thread */}
        <Card>
          {selected ? (
            <>
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{selected.subject}</CardTitle>
                  <Badge variant="outline">{selected.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 overflow-y-auto py-4" style={{ maxHeight: 420 }}>
                {selected.messages.map((m, i) => (
                  <div key={i} className={cn('flex flex-col', m.senderRole === 'user' ? 'items-end' : 'items-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm',
                        m.senderRole === 'user'
                          ? 'rounded-br-md bg-primary text-primary-foreground'
                          : m.isInternalNote
                            ? 'rounded-bl-md border border-warning/40 bg-warning/10 text-warning'
                            : 'rounded-bl-md bg-accent',
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      {m.senderName} · {formatDateTime(m.createdAt)}
                    </span>
                  </div>
                ))}
              </CardContent>
              <div className="flex gap-2 border-t border-border p-3">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  placeholder="Write a reply…"
                />
                <Button onClick={sendReply} disabled={!reply.trim()}>Send</Button>
              </div>
            </>
          ) : (
            <CardContent className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              Select a ticket to view the conversation
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
