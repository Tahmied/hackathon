'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OtpInput } from '@/components/otp-input';
import { api, apiErrorMessage } from '@/lib/api';
import { nativeCredentialsSignIn } from '@/lib/auth-form';

type LoginMode = 'password' | 'otp';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // password form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // otp form
  const [otpEmail, setOtpEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  async function doSignIn(mode: LoginMode, payload: { email: string; password?: string; code?: string }) {
    setLoading(true);
    try {
      // Step 1: validate directly against the backend → real error messages
      if (mode === 'otp') {
        await api.post('/auth/otp/verify', { email: payload.email, code: payload.code });
      } else {
        await api.post('/auth/login', { email: payload.email, password: payload.password });
      }
      // Step 2: native form POST to establish the session (full page redirect)
      await nativeCredentialsSignIn({ email: payload.email, password: payload.password, code: payload.code, mode });
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setOtpCode('');
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doSignIn('password', { email, password });
  }

  async function requestOtp() {
    if (!otpEmail.includes('@')) {
      toast.error('Enter a valid email first');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/otp/request', { email: otpEmail, purpose: 'LOGIN' });
      setOtpSent(true);
      setResendIn(60);
      const timer = setInterval(() => {
        setResendIn((s) => {
          if (s <= 1) clearInterval(timer);
          return s - 1;
        });
      }, 1000);
      toast.success('Verification code sent — check your email');
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Could not send code. Try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpComplete(code: string) {
    await doSignIn('otp', { email: otpEmail, code });
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn('google', { callbackUrl: '/dashboard' });
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
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your trading account</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="password">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="password">Password</TabsTrigger>
                <TabsTrigger value="otp">Email code</TabsTrigger>
              </TabsList>

              <TabsContent value="password">
                <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <a href="/forgot-password" className="text-xs text-primary hover:underline">
                        Forgot password?
                      </a>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign in'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="otp">
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="otp-email">Email</Label>
                    <div className="flex gap-2">
                      <Input
                        id="otp-email"
                        type="email"
                        placeholder="you@example.com"
                        value={otpEmail}
                        onChange={(e) => setOtpEmail(e.target.value)}
                        disabled={otpSent}
                      />
                      <Button variant="secondary" onClick={requestOtp} disabled={loading || otpSent}>
                        {otpSent ? 'Sent ✓' : 'Send code'}
                      </Button>
                    </div>
                  </div>
                  {otpSent && (
                    <>
                      <p className="text-center text-sm text-muted-foreground">
                        Enter the 6-digit code sent to <b>{otpEmail}</b>
                      </p>
                      <OtpInput value={otpCode} onChange={setOtpCode} onComplete={handleOtpComplete} />
                      <div className="text-center">
                        <button
                          type="button"
                          onClick={requestOtp}
                          disabled={resendIn > 0 || loading}
                          className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                        >
                          {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                        </button>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => handleOtpComplete(otpCode)}
                        disabled={otpCode.length !== 6 || loading}
                      >
                        Verify & sign in
                      </Button>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={googleLoading}>
              {googleLoading ? (
                'Redirecting…'
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              New to NovaTrade?{' '}
              <a href="/register" className="font-medium text-primary hover:underline">
                Create an account
              </a>
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by OTP verification & AI-powered fraud monitoring.
        </p>
      </div>
    </div>
  );
}
