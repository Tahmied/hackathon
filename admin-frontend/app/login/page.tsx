'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiErrorMessage } from '@/lib/api';

/**
 * Login = two steps:
 *  1. Validate credentials directly against the Express API (real error messages).
 *  2. Establish the NextAuth session with a plain HTML form POST to the auth
 *     callback (no client-side signIn quirks — this is the same request curl uses).
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    fetch('/api/auth/csrf', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken))
      .catch(() => undefined);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Step 1: real validation against the backend (throws with real messages)
      await api.post('/auth/login', { email, password });
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setLoading(false);
      // refresh csrf for the next attempt
      fetch('/api/auth/csrf', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => setCsrfToken(d.csrfToken))
        .catch(() => undefined);
      return;
    }

    // Step 2: native form POST → NextAuth sets the session cookie server-side
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/auth/callback/credentials';
    const fields: Record<string, string> = {
      csrfToken,
      email,
      password,
      mode: 'password',
      code: '',
      callbackUrl: `${window.location.origin}/admin/dashboard`,
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            N
          </div>
          <span className="text-xl font-semibold">
            Nova<span className="text-primary">Trade</span>{' '}
            <span className="text-sm font-normal text-muted-foreground">Admin</span>
          </span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-2xl">
              <ShieldCheck className="h-6 w-6 text-primary" /> Staff sign-in
            </CardTitle>
            <CardDescription>Authorized personnel only — all actions are audit-logged</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !csrfToken}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <div className="mt-6 rounded-lg bg-background/50 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Demo staff accounts</p>
              <p>tahmied@gmail.com · tahmiedhossain (super admin)</p>
              <p>admin@novatrade.dev · SuperAdmin@123</p>
              <p>finance@novatrade.dev · Finance@123</p>
              <p>kyc@novatrade.dev · KycReview@123</p>
              <p>support@novatrade.dev · Support@123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
