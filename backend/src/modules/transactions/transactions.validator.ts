import { z } from 'zod';

export const depositSchema = z.object({
  walletType: z.enum(['MAIN', 'DEMO']).default('MAIN'),
  amountBdt: z.coerce.number().positive().max(1_000_000),
  method: z.enum(['BKASH', 'NAGAD', 'ROCKET', 'BANK']),
  accountNumber: z.string().max(40).optional(),
  reference: z.string().min(4).max(60),
  receiptUrl: z.string().max(500).optional(),
});

export const withdrawalSchema = z.object({
  walletType: z.enum(['MAIN', 'DEMO']).default('MAIN'),
  amountBdt: z.coerce.number().positive().max(1_000_000),
  method: z.enum(['BKASH', 'NAGAD', 'ROCKET', 'BANK']),
  accountNumber: z.string().min(4).max(40),
});

export const listTxQuery = z.object({
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
  status: z
    .enum(['PENDING', 'APPROVED', 'REJECTED', 'CONFLICT', 'INFO_REQUESTED'])
    .optional(),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const reviewActionSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const rejectSchema = z.object({
  note: z.string().min(3, 'Rejection note is mandatory').max(1000),
});

export const resolveConflictSchema = z.object({
  note: z.string().min(10, 'A justification note (min 10 chars) is mandatory to resolve conflicts').max(2000),
  approveTransactionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'approveTransactionId required'),
});

export const txIdParams = z.object({ txId: z.string().regex(/^[0-9a-fA-F]{24}$/) });
