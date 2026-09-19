'use client';

/**
 * Establishes the NextAuth session with a plain HTML form POST to the auth
 * callback — the same request curl makes, immune to next-auth client quirks.
 * Call AFTER validating credentials against the backend directly.
 */
export function nativeCredentialsSignIn(fields: {
  email: string;
  password?: string;
  code?: string;
  mode: 'password' | 'otp';
  callbackUrl?: string;
}): Promise<void> {
  return fetch('/api/auth/csrf', { credentials: 'include' })
    .then((r) => r.json())
    .then(
      ({ csrfToken }) =>
        new Promise<void>((resolve) => {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '/api/auth/callback/credentials';
          const payload: Record<string, string> = {
            csrfToken,
            email: fields.email,
            password: fields.password ?? '',
            code: fields.code ?? '',
            mode: fields.mode,
            callbackUrl: `${window.location.origin}${fields.callbackUrl ?? '/dashboard'}`,
          };
          for (const [name, value] of Object.entries(payload)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value;
            form.appendChild(input);
          }
          document.body.appendChild(form);
          form.submit();
          resolve();
        }),
    );
}
