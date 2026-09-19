'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, MessageSquareWarning, Sparkles, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, apiErrorMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from 'next-auth/react';
import { formatBdt, formatDateTime, type TransactionView } from '@/lib/types';

const statusTabs = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFLICT', label: 'Conflicts' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'INFO_REQUESTED', label: 'Info requested' },
] as const;

export default function DepositsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>('PENDING');
  const [selected, setSelected] = useState<TransactionView | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const txs = useQuery({
    queryKey: ['admin', 'deposits', tab],
    queryFn: async () =>
      (await api.get(`/transactions?type=DEPOSIT&status=${tab}&limit=50`)).data.data
        .transactions as TransactionView[],
    refetchInterval: 10000,
  });

  // Dedicated count so the Conflicts badge is always true, whatever tab is open
  const conflictCount = useQuery({
    queryKey: ['admin', 'deposits-conflict-count'],
    queryFn: async () =>
      (await api.get('/transactions?type=DEPOSIT&status=CONFLICT&limit=1')).data.data
        .total as number,
    refetchInterval: 15000,
  });

  const detail = useQuery({
    queryKey: ['admin', 'tx', selected?._id],
    queryFn: async () => (await api.get(`/transactions/${selected!._id}`)).data.data as TransactionView,
    enabled: !!selected,
  });

  const ai = useQuery({
    queryKey: ['admin', 'ai', selected?._id],
    queryFn: async () =>
      (await api.get(`/ai/analyze/deposit/${selected!._id}`)).data.data.analysis as {
        available: boolean;
        reason?: string;
        verdict?: string;
        issues?: string[];
        summary?: string;
      },
    enabled: !!selected,
  });

  async function act(action: 'approve' | 'reject' | 'request-info') {
    if (!selected) return;
    if (action !== 'approve' && note.trim().length < 3) {
      toast.error('A note is mandatory for reject / request-info');
      return;
    }
    setActing(true);
    try {
      const res = await api.post(`/transactions/${selected._id}/${action}`, { note });
      if (res.data.code === 'ALREADY_PROCESSED' || res.data.message?.includes('Already processed')) {
        toast.warning(res.data.message);
      } else {
        toast.success(res.data.message ?? 'Done');
      }
      setSelected(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  const canApprove = can(session?.user, 'deposits:approve');
  const canReject = can(session?.user, 'deposits:reject');
  const canRequestInfo = can(session?.user, 'deposits:request_info');
  const detailData = detail.data ?? selected;
  const extracted = detailData?.extractedData;
  const claimedAmount = detailData?.amountBdt ?? 0;
  const amountMismatch = extracted?.amount != null && extracted.amount !== claimedAmount * 100;
  const refMismatch =
    extracted?.reference != null &&
    detailData?.reference != null &&
    extracted.reference.toUpperCase() !== detailData.reference.toUpperCase();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Deposit review</h1>
        <p className="text-sm text-muted-foreground">
          Verify receipts against claimed data — approvals are idempotent and audit-logged.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {statusTabs.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
              {s.value === 'CONFLICT' && (conflictCount.data ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-loss px-1.5 text-[10px] font-bold text-white">
                  {conflictCount.data}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>OCR</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(txs.data ?? []).map((tx) => (
                    <TableRow key={tx._id}>
                      <TableCell>
                        <p className="font-medium">{tx.userId?.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{tx.userId?.email}</p>
                      </TableCell>
                      <TableCell className="font-mono">{formatBdt(tx.amountBdt)}</TableCell>
                      <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
                      <TableCell>
                        {tx.ocrConfidence != null ? (
                          tx.ocrUnclear ? (
                            <Badge variant="outline" className="animate-pulse-warning border-warning/50 text-warning">
                              ⚠ AI OCR low ({Math.round(tx.ocrConfidence)}%)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-profit/40 text-profit">
                              OCR {Math.round(tx.ocrConfidence)}%
                            </Badge>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">no receipt</span>
                        )}
                        {tx.aiAnalysis?.verdict === 'MISMATCH' && (
                          <Badge className="ml-1 bg-loss text-white">MISMATCH</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="secondary" onClick={() => { setSelected(tx); setNote(''); }}>
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(txs.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No {tab.toLowerCase()} deposits.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="flex h-[94vh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Deposit review</DialogTitle>
            <DialogDescription>
              {detailData?.userId?.name} ({detailData?.userId?.email}) · {detailData?.method}
              {detailData?.status === 'CONFLICT' && (
                <Badge className="ml-2 bg-loss text-white">CONFLICT</Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Claimed form */}
            <div className="space-y-2 rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                User&apos;s submitted form
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono">{formatBdt(detailData?.amountBdt ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Reference / TrxID</span>
                <span className="font-mono text-xs">{detailData?.reference}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Method</span>
                <span>{detailData?.method}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Submitted</span>
                <span className="text-xs">{formatDateTime(detailData?.createdAt)}</span>
              </div>
            </div>

            {/* Receipt */}
            <div className="flex flex-col space-y-2 rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Uploaded receipt
              </p>
              {detailData?.receiptUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${detailData.receiptUrl}`}
                  alt="Payment receipt"
                  className="max-h-48 w-full rounded object-contain"
                />
              ) : (
                <div className="flex flex-1 items-center justify-center rounded border border-dashed border-border text-sm text-muted-foreground">
                  No screenshot uploaded
                </div>
              )}
            </div>
          </div>

          {/* OCR comparison */}
          {(extracted?.amount != null || extracted?.reference != null || detailData?.ocrUnclear) && (
            <div className="space-y-2 rounded-lg border border-border bg-background/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AI OCR extraction (cached at upload time)
              </p>
              {detailData?.ocrUnclear && (
                <div className="flex items-center gap-2 rounded border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  AI OCR Confidence Low ({Math.round(detailData?.ocrConfidence ?? 0)}%). Image may be
                  blurry. Manual review required.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className={`rounded p-2 ${amountMismatch ? 'border border-loss bg-loss/10 text-loss' : ''}`}>
                  <p className="text-xs text-muted-foreground">Extracted amount</p>
                  <p className="font-mono">
                    {extracted?.amount != null ? formatBdt(extracted.amount / 100) : 'not detected'}
                    {amountMismatch && ' ← MISMATCH'}
                  </p>
                </div>
                <div className={`rounded p-2 ${refMismatch ? 'border border-loss bg-loss/10 text-loss' : ''}`}>
                  <p className="text-xs text-muted-foreground">Extracted reference</p>
                  <p className="font-mono text-xs">
                    {extracted?.reference ?? 'not detected'}
                    {refMismatch && ' ← MISMATCH'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* AI analysis */}
          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> AI suggested analysis
            </p>
            {ai.isLoading ? (
              <p className="text-sm text-muted-foreground">Analyzing…</p>
            ) : ai.data?.available ? (
              <div className="space-y-2">
                <Badge
                  className={
                    ai.data.verdict === 'MATCH'
                      ? 'bg-profit text-white'
                      : ai.data.verdict === 'MISMATCH'
                        ? 'bg-loss text-white'
                        : 'bg-warning text-black'
                  }
                >
                  {ai.data.verdict}
                </Badge>
                {(ai.data.issues ?? []).map((issue, i) => (
                  <p key={i} className="text-sm font-medium text-loss">
                    {issue}
                  </p>
                ))}
                <p className="text-sm text-muted-foreground">{ai.data.summary}</p>
              </div>
            ) : (
              <div className="rounded border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                ⚙️ AI Service Unavailable. Manual review required.
              </div>
            )}
          </div>

          </div>

          <div className="shrink-0">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Review note (mandatory for reject / request-info)…"
            rows={2}
          />
          </div>

          <DialogFooter className="shrink-0 gap-2 pt-3 border-t border-border">
            {canRequestInfo && (
              <Button variant="outline" onClick={() => void act('request-info')} disabled={acting}>
                <MessageSquareWarning className="mr-1 h-4 w-4" /> Request info
              </Button>
            )}
            {canReject && (
              <Button variant="destructive" onClick={() => void act('reject')} disabled={acting}>
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
            )}
            {canApprove && (
              <Button className="bg-profit hover:bg-profit/90" onClick={() => void act('approve')} disabled={acting}>
                <Check className="mr-1 h-4 w-4" /> Approve & credit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
