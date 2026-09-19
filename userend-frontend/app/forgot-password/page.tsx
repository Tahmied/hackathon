'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpInput } from '@/components/otp-input';
import { api, apiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/otp/request', { email, purpose: 'PASSWORD_RESET' });
      setStep('code');
      toast.success('Reset code sent — check your email');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function completeReset() {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/password/reset', { email, code, newPassword });
      setStep('done');
      toast.success('Password updated — sign in with your new password');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <a href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            N
          </div>
          <span className="text-xl font-semibold">
            Nova<span className="text-primary">Trade</span>
          </span>
        </a>

        <Card>
          {step === 'email' && (
            <>
              <CardHeader className="text-center">
                <CardTitle>Reset your password</CardTitle>
                <CardDescription>We&apos;ll email you a 6-digit verification code</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={requestReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset code'}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {step === 'code' && (
            <>
              <CardHeader className="text-center">
                <CardTitle>Enter the code</CardTitle>
                <CardDescription>Sent to {email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <OtpInput value={code} onChange={setCode} onComplete={completeReset} />
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                  />
                </div>
                <Button className="w-full" onClick={completeReset} disabled={code.length !== 6 || loading}>
                  {loading ? 'Updating…' : 'Set new password'}
                </Button>
              </CardContent>
            </>
          )}

          {step === 'done' && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-profit">✓ Password updated</CardTitle>
                <CardDescription>You can now sign in with your new password</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => { window.location.href = '/login'; }}>
                  Go to sign in
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
