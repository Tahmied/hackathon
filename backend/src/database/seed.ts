/**
 * Idempotent seed: RBAC catalog + demo staff/trader accounts + market assets.
 * Run: npm run seed
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../shared/db/connectDb.js';
import { ensureRbacSeeded } from '../modules/permissions/permissions.service.js';
import { User } from '../modules/auth/user.model.js';
import { hashPassword } from '../modules/auth/user.model.js';
import { ensureWallets, Wallet } from '../modules/wallets/wallet.model.js';
import { Asset } from '../modules/market/asset.model.js';
import { Roles, RoleRank } from '../constants/roles.js';
import { logger } from '../shared/utils/logger.js';

const STAFF_ACCOUNTS: { name: string; email: string; password: string; role: (typeof Roles)[keyof typeof Roles] }[] = [
  { name: 'Super Admin', email: 'admin@novatrade.dev', password: 'SuperAdmin@123', role: Roles.SUPER_ADMIN },
  { name: 'Finance Reviewer', email: 'finance@novatrade.dev', password: 'Finance@123', role: Roles.FINANCE_REVIEWER },
  { name: 'KYC Reviewer', email: 'kyc@novatrade.dev', password: 'KycReview@123', role: Roles.KYC_REVIEWER },
  { name: 'Support Agent', email: 'support@novatrade.dev', password: 'Support@123', role: Roles.SUPPORT_AGENT },
];

const TRADER_ACCOUNTS: { name: string; email: string; password: string; mainBdt: number; demoBdt: number }[] = [
  { name: 'Rahim Ahmed', email: 'rahim@novatrade.dev', password: 'Trader@123', mainBdt: 50000, demoBdt: 100000 },
  { name: 'Karim Islam', email: 'karim@novatrade.dev', password: 'Trader@123', mainBdt: 10000, demoBdt: 100000 },
];

const ASSETS = [
  { symbol: 'BTC/USD', name: 'Bitcoin', category: 'CRYPTO', basePrice: 68000, volatility: 0.0012, leverageOptions: [1, 2, 5, 10, 20] },
  { symbol: 'ETH/USD', name: 'Ethereum', category: 'CRYPTO', basePrice: 3500, volatility: 0.0015, leverageOptions: [1, 2, 5, 10, 20] },
  { symbol: 'SOL/USD', name: 'Solana', category: 'CRYPTO', basePrice: 165, volatility: 0.002, leverageOptions: [1, 2, 5, 10] },
  { symbol: 'XAU/USD', name: 'Gold Spot', category: 'COMMODITY', basePrice: 2550, volatility: 0.0004, leverageOptions: [1, 5, 10, 20] },
  { symbol: 'EUR/BDT', name: 'Euro / Bangladeshi Taka', category: 'FOREX', basePrice: 130, quoteCurrency: 'BDT', volatility: 0.0003, leverageOptions: [1, 5, 10, 20] },
  { symbol: 'USD/BDT', name: 'US Dollar / Bangladeshi Taka', category: 'FOREX', basePrice: 120, quoteCurrency: 'BDT', volatility: 0.0002, leverageOptions: [1, 5, 10] },
] as const;

async function upsertUser(input: {
  name: string;
  email: string;
  password: string;
  role?: string;
}) {
  const existing = await User.findByEmailWithSecrets(input.email);
  if (existing) return existing;
  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: (input.role ?? Roles.USER) as never,
    roleRank: input.role ? RoleRank[input.role as keyof typeof RoleRank] : RoleRank.user,
    emailVerified: true,
  });
  return user;
}

async function main() {
  await connectDb();
  logger.info('— seeding RBAC —');
  await ensureRbacSeeded();

  logger.info('— seeding accounts —');
  for (const account of STAFF_ACCOUNTS) {
    const user = await upsertUser(account);
    await ensureWallets(user._id);
    logger.info(`  ${account.role}: ${account.email}`);
  }
  for (const trader of TRADER_ACCOUNTS) {
    const user = await upsertUser({ ...trader, role: Roles.USER });
    await ensureWallets(user._id);
    await Wallet.updateOne(
      { userId: user._id, type: 'MAIN' },
      { $set: { available: Math.round(trader.mainBdt * 100) } },
    );
    await Wallet.updateOne(
      { userId: user._id, type: 'DEMO' },
      { $set: { available: Math.round(trader.demoBdt * 100) } },
    );
    logger.info(`  user: ${trader.email} (main ৳${trader.mainBdt}, demo ৳${trader.demoBdt})`);
  }

  logger.info('— seeding assets —');
  for (const asset of ASSETS) {
    await Asset.updateOne(
      { symbol: asset.symbol },
      {
        $setOnInsert: {
          symbol: asset.symbol,
          name: asset.name,
          category: asset.category,
          basePrice: asset.basePrice,
          quoteCurrency: 'quoteCurrency' in asset ? asset.quoteCurrency : 'USD',
          usdBdtRate: 120,
          volatility: asset.volatility,
          driftReversion: 0.002,
          leverageOptions: [...asset.leverageOptions],
          minMarginPaisa: 100 * 100,
          maxMarginPaisa: 500000 * 100,
          lastPrice: asset.basePrice,
          isActive: true,
        },
      },
      { upsert: true },
    );
    logger.info(`  ${asset.symbol}`);
  }

  logger.info('✅ seed complete');
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
