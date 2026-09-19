import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    error?: 'RefreshTokenError';
    user: {
      id: string;
      role: string;
      roleRank: number;
      permissions: string[];
      kycStatus?: string;
      avatarUrl?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
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
  }
}
