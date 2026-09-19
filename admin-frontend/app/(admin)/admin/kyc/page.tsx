'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, AlertTriangle, Sparkles } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { api, apiErrorMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/types';
import type { KycAdminView } from '@/lib/admin-types';

export default function KycReviewPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING');
  const [selected, setSelected] = useState<KycAdminView | null>(null);
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);

  const queue = useQuery({
    queryKey: ['admin', 'kyc', statusFilter],
    queryFn: async () =>
      (await api.get(`/kyc?status=${statusFilter}`)).data.data.submissions as KycAdminView[],
    refetchInterval: 10000,
  });

  const ai = useQuery({
    queryKey: ['admin', 'kyc-ai', selected?._id],
    queryFn: async () =>
      (await api.get(`/ai/analyze/kyc/${selected!._id}`)).data.data.analysis as {
        available: boolean;
        reason?: string;
        nameMatch?: boolean | null;
        issues?: string[];
        summary?: string;
      },
    enabled: !!selected,
  });

  async function review(approve: boolean) {
    if (!selected) return;
    if (comment.trim().length < 3) {
      toast.error('A review comment is mandatory');
      return;
    }
    setActing(true);
    try {
      await api.post(`/kyc/${selected._id}/review`, { approve, comment });
      toast.success(approve ? 'KYC approved' : 'KYC rejected');
      setSelected(null);
      setComment('');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  const canReview = can(session?.user, 'kyc:review');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">KYC review</h1>
        <p className="text-sm text-muted-foreground">
          AI reads the document (OCR) and compares the name with the profile — you make the call.
        </p>
      </div>

      <div className="flex gap-2">
        {(['PENDING', 'VERIFIED', 'REJECTED'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(queue.data ?? []).map((k) => (
          <Card key={k._id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{k.userId?.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {k.userId?.email} · {k.docType}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {k.ocrUnclear ? (
                <div className="flex items-center gap-1.5 rounded border border-warning/50 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  OCR low confidence ({Math.round(k.ocrConfidence ?? 0)}%)
                </div>
              ) : k.aiAnalysis?.available ? (
                <div className="text-[11px]">
                  <span className={k.aiAnalysis.nameMatch === false ? 'font-semibold text-loss' : 'font-semibold text-profit'}>
                    AI name match: {k.aiAnalysis.nameMatch === false ? 'FAILED' : k.aiAnalysis.nameMatch === true ? 'OK' : 'unclear'}
                  </span>
                  {k.aiAnalysis.summary && <p className="mt-1 text-muted-foreground">{k.aiAnalysis.summary}</p>}
                </div>
              ) : k.aiAnalysis && !k.aiAnalysis.available ? (
                <p className="text-[11px] text-muted-foreground">
                  ⚙️ AI unavailable — manual review required
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">AI analysis pending…</p>
              )}
              <Button size="sm" variant="secondary" className="w-full" onClick={() => { setSelected(k); setComment(''); }}>
                Review document
              </Button>
            </CardContent>
          </Card>
        ))}
        {(queue.data ?? []).length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No {statusFilter.toLowerCase()} KYC submissions.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="flex h-[94vh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>KYC review — {selected?.userId?.name}</DialogTitle>
            <DialogDescription>
              {selected?.docType} · declared name: {selected?.fullNameOnDoc ?? '—'} · doc #:{' '}
              {selected?.docNumber ?? '—'} · profile: {selected?.userId?.email}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable review workspace */}
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
            {/* Document */}
            <div className="flex min-h-0 flex-col gap-2">
              {selected?.frontUrl ? (
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${selected.frontUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Click to open the full-size document"
                  className="block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${selected.frontUrl}`}
                    alt="Document front"
                    className="w-full rounded-lg border border-border object-contain"
                  />
                </a>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border p-10 text-sm text-muted-foreground">
                  No document image
                </div>
              )}
              {selected?.backUrl && (
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${selected.backUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${selected.backUrl}`}
                    alt="Document back"
                    className="w-full rounded-lg border border-border object-contain"
                  />
                </a>
              )}
              <div className="rounded-lg bg-background/40 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  OCR extracted name:{' '}
                  <span className={cn(selected?.aiAnalysis?.nameMatch === false && 'text-loss')}>
                    {selected?.extractedName ?? '—'}
                  </span>
                  {selected?.aiAnalysis?.nameMatch === false && (
                    <span className="ml-1 font-semibold">← doesn&apos;t match profile</span>
                  )}
                </p>
                {selected?.ocrConfidence != null && (
                  <p className="mt-0.5 text-muted-foreground">
                    OCR confidence: {Math.round(selected.ocrConfidence)}%
                    {selected.ocrUnclear ? ' · low — document may be blurry' : ''}
                  </p>
                )}
              </div>
            </div>

            {/* AI analysis + OCR text */}
            <div className="flex min-h-0 flex-col gap-3">
              <div className="rounded-lg border border-border p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> AI analysis
                </p>
                {ai.isLoading ? (
                  <p className="text-sm text-muted-foreground">Analyzing…</p>
                ) : ai.data?.available ? (
                  <div className="space-y-2">
                    <Badge
                      className={
                        ai.data.nameMatch === true
                          ? 'bg-profit text-white'
                          : ai.data.nameMatch === false
                            ? 'bg-loss text-white'
                            : 'bg-warning text-black'
                      }
                    >
                      Name match: {ai.data.nameMatch === true ? 'YES' : ai.data.nameMatch === false ? 'NO' : 'UNCLEAR'}
                    </Badge>
                    {(ai.data.issues ?? []).map((i, idx) => (
                      <p key={idx} className="text-sm leading-relaxed text-loss">
                        • {i}
                      </p>
                    ))}
                    <p className="text-sm leading-relaxed text-muted-foreground">{ai.data.summary}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    ⚙️ AI Service Unavailable. Manual review required.
                  </p>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-background/40">
                <p className="border-b border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Raw OCR text
                </p>
                <div className="max-h-44 flex-1 overflow-y-auto p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {selected?.ocrText || '—'}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Submitted {formatDateTime(selected?.createdAt)}
              </p>
            </div>
          </div>

          {/* Sticky review footer */}
          <div className="shrink-0 space-y-3 border-t border-border pt-3">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Review comment (mandatory) — sent to the user on rejection…"
              rows={2}
            />
            {canReview && (
              <DialogFooter className="gap-2">
                <Button variant="destructive" onClick={() => void review(false)} disabled={acting}>
                  <X className="mr-1 h-4 w-4" /> Reject
                </Button>
                <Button className="bg-profit hover:bg-profit/90" onClick={() => void review(true)} disabled={acting}>
                  <Check className="mr-1 h-4 w-4" /> Approve
                </Button>
              </DialogFooter>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
