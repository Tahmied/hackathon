import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  ACCESS_TOKEN_KEY: z.string().min(16, 'ACCESS_TOKEN_KEY is required'),
  ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_KEY: z.string().min(16, 'REFRESH_TOKEN_KEY is required'),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('meta-llama/llama-3.3-70b-instruct:free'),
  AI_TIMEOUT_MS: z.coerce.number().default(30000),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_SECURE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('NovaTrade <noreply@novatrade.dev>'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  DEMO_MODE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  UPLOAD_DIR: z.string().default('uploads'),
  MARKET_TICK_MS: z.coerce.number().default(1000),
  MARKET_STALE_MS: z.coerce.number().default(5000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
export const isDev = env.NODE_ENV === 'development';
