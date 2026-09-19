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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>KYC review — {selected?.userId?.name}</DialogTitle>
            <DialogDescription>
              {selected?.docType} · declared name: {selected?.fullNameOnDoc ?? '—'} · doc #:{' '}
              {selected?.docNumber ?? '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              {selected?.frontUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${selected.frontUrl}`}
                  alt="Document front"
                  className="max-h-64 w-full rounded border border-border object-contain"
                />
              )}
              {selected?.extractedName && (
                <p className="text-xs text-muted-foreground">
                  OCR extracted name: <b className="text-foreground">{selected.extractedName}</b>
                  {selected.aiAnalysis?.nameMatch === false && (
                    <span className="ml-1 font-semibold text-loss">← doesn&apos;t match profile</span>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> AI analysis
              </p>
              {ai.isLoading ? (
                <p className="text-sm text-muted-foreground">Analyzing…</p>
              ) : ai.data?.available ? (
                <>
                  <Badge
                    className={
                      ai.data.nameMatch === true ? 'bg-profit text-white' : ai.data.nameMatch === false ? 'bg-loss text-white' : 'bg-warning text-black'
                    }
                  >
                    Name match: {ai.data.nameMatch === true ? 'YES' : ai.data.nameMatch === false ? 'NO' : 'UNCLEAR'}
                  </Badge>
                  {(ai.data.issues ?? []).map((i, idx) => (
                    <p key={idx} className="text-sm text-loss">• {i}</p>
                  ))}
                  <p className="text-sm text-muted-foreground">{ai.data.summary}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  ⚙️ AI Service Unavailable. Manual review required.
                </p>
              )}
              <div className="mt-2 max-h-32 overflow-y-auto rounded bg-background/50 p-2 text-[11px] text-muted-foreground">
                <p className="mb-1 font-semibold">OCR text</p>
                {selected?.ocrText?.slice(0, 500) ?? '—'}
              </div>
              <p className="text-[11px] text-muted-foreground">Submitted {formatDateTime(selected?.createdAt)}</p>
            </div>
          </div>

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
        </DialogContent>
      </Dialog>
    </div>
  );
}
