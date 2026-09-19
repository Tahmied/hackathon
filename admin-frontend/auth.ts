import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

interface BackendAuthResponse {
  success: boolean;
  message?: string;
  data?: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      roleRank: number;
      permissions: string[];
      kycStatus?: string;
      avatarUrl?: string;
    };
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  // Fully distinct cookie names so the admin app never shares cookies with the
  // trader app (both run on localhost — cookies are per-host, not per-port).
  cookies: {
    sessionToken: {
      name: 'novatrade.admin.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    },
    csrfToken: {
      name: 'novatrade.admin.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    },
    callbackUrl: {
      name: 'novatrade.admin.callback-url',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    },
    pkceCodeVerifier: {
      name: 'novatrade.admin.pkce-code-verifier',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    },
  },
  pages: { signIn: '/login', error: '/login' },
  providers: [
    Google,
    Credentials({
      credentials: {
        email: {},
        password: {},
        code: {},
        mode: {},
      },
      authorize: async (credentials) => {
        const mode = String(credentials.mode ?? 'password');
        try {
          let res: Response;
          if (mode === 'otp') {
            res = await fetch(`${BACKEND}/api/v1/auth/otp/verify`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: credentials.email, code: credentials.code }),
            });
          } else {
            res = await fetch(`${BACKEND}/api/v1/auth/login`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: credentials.email, password: credentials.password }),
            });
          }
          const json = (await res.json()) as BackendAuthResponse;
          if (!res.ok || !json.data) return null;
          return {
            id: json.data.user.id,
            name: json.data.user.name,
            email: json.data.user.email,
            accessToken: json.data.accessToken,
            refreshToken: json.data.refreshToken,
            backendUser: json.data.user,
          } as never;
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      const t = token as unknown as {
        accessToken?: string;
        refreshToken?: string;
        accessTokenExpires?: number;
        error?: 'RefreshTokenError';
        user?: {
          id: string;
          name?: string | null;
          email?: string | null;
          role: string;
          roleRank: number;
          permissions: string[];
          kycStatus?: string;
          avatarUrl?: string;
        };
      };

      // Initial sign-in (credentials path)
      const anyUser = user as unknown as
        | { id: string; accessToken?: string; refreshToken?: string; backendUser?: Record<string, unknown> }
        | undefined;

      if (account?.provider === 'google' && profile?.email) {
        // Exchange the Google profile for backend JWTs
        try {
          const res = await fetch(`${BACKEND}/api/v1/auth/google`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: profile.email,
              name: profile.name ?? profile.email.split('@')[0],
              googleId: String((profile as { sub?: string }).sub ?? account.providerAccountId),
              avatarUrl: (profile as { picture?: string }).picture,
              emailVerified: (profile as { email_verified?: boolean }).email_verified ?? true,
            }),
          });
          const json = (await res.json()) as BackendAuthResponse;
          if (json.data) {
            t.accessToken = json.data.accessToken;
            t.refreshToken = json.data.refreshToken;
            t.accessTokenExpires = Date.now() + 14 * 60 * 1000;
            t.user = { ...json.data.user };
            t.error = undefined;
          }
        } catch {
          t.error = 'RefreshTokenError';
        }
        return t as typeof token;
      }

      if (anyUser?.accessToken) {
        t.accessToken = anyUser.accessToken;
        t.refreshToken = anyUser.refreshToken;
        t.accessTokenExpires = Date.now() + 14 * 60 * 1000;
        t.user = {
          id: anyUser.id,
          ...(anyUser.backendUser as Record<string, never> | undefined),
        } as never;
        return t as typeof token;
      }

      // Subsequent calls: refresh if close to expiry
      if (t.accessTokenExpires && Date.now() < t.accessTokenExpires) {
        return token;
      }
      if (!t.refreshToken) return token;

      try {
        const res = await fetch(`${BACKEND}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: t.refreshToken }),
        });
        if (!res.ok) {
          t.error = 'RefreshTokenError';
          return t as typeof token;
        }
        const json = (await res.json()) as BackendAuthResponse;
        if (json.data) {
          t.accessToken = json.data.accessToken;
          t.refreshToken = json.data.refreshToken;
          t.accessTokenExpires = Date.now() + 14 * 60 * 1000;
          t.user = { ...(t.user ?? {}), ...json.data.user } as never;
          t.error = undefined;
        }
      } catch {
        t.error = 'RefreshTokenError';
      }
      return t as typeof token;
    },
    async session({ session, token }) {
      const t = token as unknown as {
        accessToken?: string;
        error?: 'RefreshTokenError';
        user?: {
          id: string;
          name?: string | null;
          email?: string | null;
          role: string;
          roleRank: number;
          permissions: string[];
          kycStatus?: string;
          avatarUrl?: string;
        };
      };
      const s = session as unknown as {
        accessToken?: string;
        error?: 'RefreshTokenError';
        user: Record<string, unknown>;
      };
      s.accessToken = t.accessToken;
      s.error = t.error;
      if (t.user) {
        s.user.id = t.user.id;
        s.user.role = t.user.role ?? 'user';
        s.user.roleRank = t.user.roleRank ?? 10;
        s.user.permissions = t.user.permissions ?? [];
        s.user.kycStatus = t.user.kycStatus;
        s.user.avatarUrl = t.user.avatarUrl;
        s.user.name = t.user.name ?? s.user.name;
        s.user.email = t.user.email ?? s.user.email;
      }
      return session;
    },
  },
});
