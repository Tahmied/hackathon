'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wrench, PauseCircle, PlayCircle, Unplug, AlertOctagon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, apiErrorMessage } from '@/lib/api';

interface DevtoolsStatus {
  demoMode: boolean;
  feedPaused: boolean;
  market: { stale: boolean; latencyMs: number };
  ai: { configured: boolean; simulatedOutage: boolean; model: string };
}

export default function DevtoolsPage() {
  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  const status = useQuery({
    queryKey: ['admin', 'devtools'],
    queryFn: async () => (await api.get('/devtools/status')).data.data as DevtoolsStatus,
    refetchInterval: 5000,
  });

  // Watch for stale feed to auto-clear
  useEffect(() => {
    if (status.data && !status.data.market.stale) {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    }
  }, [status.data?.market.stale, queryClient, status.data]);

  async function toggleFeed() {
    try {
      const paused = !status.data?.feedPaused;
      await api.post('/devtools/market/pause', { enabled: paused });
      toast.success(paused ? 'Market feed PAUSED — staleness fires in ~5s' : 'Market feed resumed');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function toggleAi() {
    try {
      const enabled = !status.data?.ai.simulatedOutage;
      await api.post('/devtools/ai/outage', { enabled });
      toast.success(enabled ? 'AI outage SIMULATED — all AI features degrade gracefully' : 'AI restored');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function seedConflict() {
    setSeeding(true);
    try {
      const res = await api.post('/devtools/seed-conflict');
      toast.success(`Conflict seeded — reference ${res.data.data.reference}. Check Conflicts page.`);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wrench className="h-6 w-6 text-warning" /> Demo triggers
        </h1>
        <p className="text-sm text-muted-foreground">
          Fire the challenge cases live during your presentation. Guarded by DEMO_MODE.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Challenge Case 3a: stale market */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <PauseCircle className="h-4 w-4 text-warning" /> Challenge 3: stale market
              </span>
              <Badge variant="outline" className={status.data?.market.stale ? 'border-warning/50 text-warning' : 'border-profit/50 text-profit'}>
                {status.data?.market.stale ? 'STALE' : 'LIVE'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Pause the simulated feed. After ~5 seconds the backend broadcasts <code className="font-mono">MARKET_STALE</code>,
              trading returns 503, users see a yellow banner, and an alert appears on the dashboard.
            </p>
            <Button variant={status.data?.feedPaused ? 'default' : 'outline'} className="w-full" onClick={() => void toggleFeed()}>
              {status.data?.feedPaused ? (
                <><PlayCircle className="mr-1 h-4 w-4" /> Resume feed</>
              ) : (
                <><PauseCircle className="mr-1 h-4 w-4" /> Pause feed (5s to stale)</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Challenge 3c: AI outage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Unplug className="h-4 w-4 text-warning" /> Challenge 3: AI outage
              </span>
              <Badge variant="outline" className={status.data?.ai.simulatedOutage ? 'border-loss/50 text-loss' : 'border-profit/50 text-profit'}>
                {status.data?.ai.simulatedOutage ? 'DOWN' : 'UP'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Simulate an OpenRouter failure. Review boxes gray out (&ldquo;manual review required&rdquo;),
              the user chatbot replies with a fallback message, the rule-based engine takes over.
            </p>
            <Button variant={status.data?.ai.simulatedOutage ? 'default' : 'outline'} className="w-full" onClick={() => void toggleAi()}>
              {status.data?.ai.simulatedOutage ? 'Restore AI service' : 'Kill AI service'}
            </Button>
          </CardContent>
        </Card>

        {/* Challenge 2: duplicate reference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertOctagon className="h-4 w-4 text-loss" /> Challenge 2: duplicate reference
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Submit two deposits with the <b>same TrxID</b> from two different seeded users (Rahim &amp;
              Karim) with different claimed amounts. A CRITICAL alert fires instantly.
            </p>
            <Button variant="destructive" className="w-full" onClick={() => void seedConflict()} disabled={seeding}>
              {seeding ? 'Seeding…' : 'Seed duplicate-reference conflict'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Challenge 1 + 3b walkthrough hints */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How to demo the other cases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <b className="text-foreground">Challenge 1 (reserved balance):</b> Open a trade on the user
            app (even demo wallet), then click the &ldquo;Reserved&rdquo; card on the dashboard — it names
            the exact trades holding funds. Or ask the AI chat: &ldquo;my balance is 10,000, where is my
            3,000?&rdquo; with that account.
          </p>
          <p>
            <b className="text-foreground">Challenge 3 (double approval):</b> Approve any deposit, then
            try approving it again (two clicks / two tabs) — the second attempt returns 409
            &ldquo;Already processed — idempotency check passed&rdquo;. The user&apos;s timeline under
            Users → Timeline reconstructs the full sequence.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
