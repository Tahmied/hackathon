import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { ApiError } from '../../shared/utils/ApiError.js';
import { withTransaction } from '../../shared/db/connectDb.js';
import { Wallet } from '../wallets/wallet.model.js';
import { Transaction, type TransactionDoc } from './transaction.model.js';
import {
  TransactionStatuses,
  TransactionTypes,
  type PaymentMethod,
  type TransactionStatus,
  type TransactionType,
  type WalletType,
} from '../../constants/index.js';
import { parseBdtToPaisa, toBdt } from '../../shared/utils/money.js';
import { logAudit } from '../audit/audit.model.js';
import { notifyUser } from '../notifications/notifications.service.js';
import { raiseAlert } from '../admin/systemAlert.model.js';
import { getIO } from '../../sockets/io.js';

interface ActorMeta {
  id: string;
  role: string;
  ip?: string;
  userAgent?: string;
}

async function checkDuplicateReference(reference: string, excludeId?: string) {
  const filter: Record<string, unknown> = {
    type: TransactionTypes.DEPOSIT,
    reference: reference.trim(),
    status: { $nin: [TransactionStatuses.REJECTED, TransactionStatuses.INFO_REQUESTED] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Transaction.findOne(filter).lean();
}

export async function submitDeposit(
  userId: string,
  input: {
    walletType: WalletType;
    amountBdt: number;
    method: PaymentMethod;
    accountNumber?: string;
    reference: string;
    receiptUrl?: string;
  },
) {
  const amountPaisa = parseBdtToPaisa(input.amountBdt);
  if (!amountPaisa) throw ApiError.badRequest('Invalid amount');

  const wallet = await Wallet.findOne({ userId, type: input.walletType });
  if (!wallet) throw ApiError.notFound('Wallet not found');

  // Challenge Case 2: duplicate payment reference across accounts
  const duplicate = await checkDuplicateReference(input.reference);
  const conflictGroupId = duplicate?.conflictGroupId ?? crypto.randomUUID();

  const deposit = await Transaction.create({
    userId,
    walletId: wallet._id,
    walletType: input.walletType,
    type: TransactionTypes.DEPOSIT,
    amount: amountPaisa,
    method: input.method,
    accountNumber: input.accountNumber,
    reference: input.reference.trim(),
    receiptUrl: input.receiptUrl,
    status: duplicate ? TransactionStatuses.CONFLICT : TransactionStatuses.PENDING,
    conflictGroupId: duplicate ? conflictGroupId : undefined,
    conflictWith: duplicate ? [duplicate._id] : undefined,
  });

  if (duplicate) {
    await Transaction.updateOne(
      { _id: duplicate._id, status: { $in: [TransactionStatuses.PENDING, TransactionStatuses.CONFLICT] } },
      {
        $set: { status: TransactionStatuses.CONFLICT, conflictGroupId },
        $addToSet: { conflictWith: deposit._id },
      },
    );
    await raiseAlert(
      'DUPLICATE_REFERENCE',
      'CRITICAL',
      `Duplicate deposit reference "${input.reference}" — users ${duplicate.userId} & ${userId}`,
      { conflictGroupId, depositIds: [String(duplicate._id), String(deposit._id)] },
    );
    getIO()?.to('staff').emit('alert:new', {
      type: 'DUPLICATE_REFERENCE',
      message: `Duplicate deposit reference: ${input.reference}`,
      conflictGroupId,
    });
  }

  await logAudit({
    actorId: userId,
    actorRole: 'user',
    action: 'deposit.submitted',
    targetType: 'transaction',
    targetId: deposit._id,
    metadata: {
      userId,
      amountPaisa,
      reference: input.reference,
      method: input.method,
      conflict: Boolean(duplicate),
    },
  });

  await notifyUser({
    userId,
    type: 'DEPOSIT_SUBMITTED',
    title: 'Deposit request submitted',
    body: duplicate
      ? 'Your deposit is under conflict review — a support agent will contact you.'
      : 'Your deposit request is pending review.',
    data: { transactionId: String(deposit._id) },
  });

  // Fire-and-forget OCR + AI analysis of the receipt
  if (input.receiptUrl) {
    processReceipt(deposit._id.toString()).catch(() => undefined);
  }

  return { deposit, conflict: Boolean(duplicate) };
}

export async function submitWithdrawal(
  userId: string,
  input: { walletType: WalletType; amountBdt: number; method: PaymentMethod; accountNumber: string },
) {
  const amountPaisa = parseBdtToPaisa(input.amountBdt);
  if (!amountPaisa) throw ApiError.badRequest('Invalid amount');

  const withdrawal = await withTransaction(async (session) => {
    // Validation happens against AVAILABLE balance (not total) — atomic move to reserved
    const wallet = await Wallet.findOneAndUpdate(
      { userId, type: input.walletType, available: { $gte: amountPaisa } },
      { $inc: { available: -amountPaisa, reserved: amountPaisa } },
      { new: true, session },
    );
    if (!wallet) {
      throw ApiError.badRequest(
        'Insufficient available balance for this withdrawal',
        'INSUFFICIENT_AVAILABLE',
      );
    }
    const [created] = await Transaction.create(
      [
        {
          userId,
          walletId: wallet._id,
          walletType: input.walletType,
          type: TransactionTypes.WITHDRAWAL,
          amount: amountPaisa,
          method: input.method,
          accountNumber: input.accountNumber,
          reference: `WD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
          status: TransactionStatuses.PENDING,
        },
      ],
      { session },
    );
    return created;
  });

  await logAudit({
    actorId: userId,
    actorRole: 'user',
    action: 'withdrawal.submitted',
    targetType: 'transaction',
    targetId: withdrawal._id,
    metadata: { userId, amountPaisa, method: input.method },
  });

  await notifyUser({
    userId,
    type: 'WITHDRAWAL_SUBMITTED',
    title: 'Withdrawal request submitted',
    body: 'Your withdrawal request is pending review.',
    data: { transactionId: String(withdrawal._id) },
  });

  return withdrawal;
}

function assertReviewable(status: TransactionStatus, expected: TransactionStatus[]) {
  if (!expected.includes(status)) {
    if (status === TransactionStatuses.APPROVED) {
      // Challenge Case 3: idempotency — balance is protected
      throw ApiError.conflict(
        'Already processed earlier — idempotency check passed, balance was not changed again',
        'ALREADY_PROCESSED',
      );
    }
    throw ApiError.conflict(`Transaction is ${status} and cannot be processed`, 'INVALID_STATE');
  }
}

export async function approveDeposit(txId: string, actor: ActorMeta) {
  const result = await withTransaction(async (session) => {
    const tx = await Transaction.findOne({
      _id: txId,
      status: { $in: [TransactionStatuses.PENDING, TransactionStatuses.CONFLICT] },
      type: TransactionTypes.DEPOSIT,
    }).session(session);
    if (!tx) {
      const existing = await Transaction.findById(txId).session(session);
      if (existing) assertReviewable(existing.status, [TransactionStatuses.PENDING, TransactionStatuses.CONFLICT]);
      throw ApiError.notFound('Deposit not found');
    }
    await Wallet.findByIdAndUpdate(
      tx.walletId,
      { $inc: { available: tx.amount } },
      { session },
    );
    tx.status = TransactionStatuses.APPROVED;
    tx.processedBy = new Types.ObjectId(actor.id);
    tx.processedAt = new Date();
    tx.adminNote = tx.adminNote;
    await tx.save({ session });
    return tx;
  });

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'deposit.approved',
    targetType: 'transaction',
    targetId: txId,
    metadata: { userId: result.userId.toString(), amountPaisa: result.amount, idempotencyCheck: 'passed' },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  await notifyUser({
    userId: String(result.userId),
    type: 'DEPOSIT_APPROVED',
    title: 'Deposit approved',
    body: `৳${toBdt(result.amount).toFixed(2)} has been added to your ${result.walletType} account.`,
    data: { transactionId: txId },
  });

  getIO()?.to(`user:${result.userId}`).emit('transaction:update', {
    transactionId: txId,
    status: TransactionStatuses.APPROVED,
  });

  return result;
}

export async function rejectDeposit(txId: string, note: string, actor: ActorMeta) {
  const tx = await Transaction.findOneAndUpdate(
    {
      _id: txId,
      type: TransactionTypes.DEPOSIT,
      status: { $in: [TransactionStatuses.PENDING, TransactionStatuses.CONFLICT, TransactionStatuses.INFO_REQUESTED] },
    },
    {
      $set: {
        status: TransactionStatuses.REJECTED,
        processedBy: new Types.ObjectId(actor.id),
        processedAt: new Date(),
        adminNote: note,
      },
    },
    { new: true },
  );
  if (!tx) {
    const existing = await Transaction.findById(txId);
    if (existing) assertReviewable(existing.status, [TransactionStatuses.PENDING, TransactionStatuses.CONFLICT]);
    throw ApiError.notFound('Deposit not found');
  }

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'deposit.rejected',
    targetType: 'transaction',
    targetId: txId,
    metadata: { userId: tx.userId.toString(), note },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
  await notifyUser({
    userId: String(tx.userId),
    type: 'DEPOSIT_REJECTED',
    title: 'Deposit rejected',
    body: note,
    data: { transactionId: txId },
  });
  return tx;
}

export async function requestDepositInfo(txId: string, note: string, actor: ActorMeta) {
  const tx = await Transaction.findOneAndUpdate(
    {
      _id: txId,
      type: TransactionTypes.DEPOSIT,
      status: { $in: [TransactionStatuses.PENDING, TransactionStatuses.CONFLICT] },
    },
    {
      $set: {
        status: TransactionStatuses.INFO_REQUESTED,
        processedBy: new Types.ObjectId(actor.id),
        infoRequestNote: note,
      },
    },
    { new: true },
  );
  if (!tx) throw ApiError.conflict('Deposit cannot be updated in its current state');
  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'deposit.info_requested',
    targetType: 'transaction',
    targetId: txId,
    metadata: { userId: tx.userId.toString(), note },
    ip: actor.ip,
  });
  await notifyUser({
    userId: String(tx.userId),
    type: 'DEPOSIT_INFO_REQUESTED',
    title: 'More info needed for your deposit',
    body: note,
    data: { transactionId: txId },
  });
  return tx;
}

export async function approveWithdrawal(txId: string, actor: ActorMeta) {
  const tx = await withTransaction(async (session) => {
    const found = await Transaction.findOne({
      _id: txId,
      type: TransactionTypes.WITHDRAWAL,
      status: TransactionStatuses.PENDING,
    }).session(session);
    if (!found) {
      const existing = await Transaction.findById(txId).session(session);
      if (existing) assertReviewable(existing.status, [TransactionStatuses.PENDING]);
      throw ApiError.notFound('Withdrawal not found');
    }
    // Reserved funds leave the system (simulated payout)
    const wallet = await Wallet.findByIdAndUpdate(
      found.walletId,
      { $inc: { reserved: -found.amount } },
      { new: true, session },
    );
    if (!wallet || wallet.reserved < 0) {
      throw ApiError.conflict('Wallet reserved balance inconsistency — approval blocked');
    }
    found.status = TransactionStatuses.APPROVED;
    found.processedBy = new Types.ObjectId(actor.id);
    found.processedAt = new Date();
    await found.save({ session });
    return found;
  });

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'withdrawal.approved',
    targetType: 'transaction',
    targetId: txId,
    metadata: { userId: tx.userId.toString(), amountPaisa: tx.amount },
    ip: actor.ip,
  });
  await notifyUser({
    userId: String(tx.userId),
    type: 'WITHDRAWAL_APPROVED',
    title: 'Withdrawal approved',
    body: `৳${toBdt(tx.amount).toFixed(2)} payout sent via ${tx.method}.`,
    data: { transactionId: txId },
  });
  return tx;
}

export async function rejectWithdrawal(txId: string, note: string, actor: ActorMeta) {
  const tx = await withTransaction(async (session) => {
    const found = await Transaction.findOneAndUpdate(
      {
        _id: txId,
        type: TransactionTypes.WITHDRAWAL,
        status: TransactionStatuses.PENDING,
      },
      {
        $set: {
          status: TransactionStatuses.REJECTED,
          processedBy: new Types.ObjectId(actor.id),
          processedAt: new Date(),
          adminNote: note,
        },
      },
      { new: true, session },
    );
    if (!found) throw ApiError.conflict('Withdrawal cannot be rejected in its current state');
    // Refund the reservation back to available
    await Wallet.findByIdAndUpdate(
      found.walletId,
      { $inc: { reserved: -found.amount, available: found.amount } },
      { session },
    );
    return found;
  });

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'withdrawal.rejected',
    targetType: 'transaction',
    targetId: txId,
    metadata: { userId: tx.userId.toString(), note },
    ip: actor.ip,
  });
  await notifyUser({
    userId: String(tx.userId),
    type: 'WITHDRAWAL_REJECTED',
    title: 'Withdrawal rejected',
    body: `${note} Funds returned to your available balance.`,
    data: { transactionId: txId },
  });
  return tx;
}

/** Challenge Case 2 workflow: forced explicit resolution + justification. */
export async function resolveConflict(
  conflictGroupId: string,
  input: { approveTransactionId: string; note: string },
  actor: ActorMeta,
) {
  const group = await Transaction.find({ conflictGroupId }).lean();
  if (group.length < 2) throw ApiError.notFound('Conflict group not found');
  const winner = group.find((t) => t._id.toString() === input.approveTransactionId);
  if (!winner) throw ApiError.badRequest('approveTransactionId is not part of this conflict group');

  const approved: string[] = [];
  const rejected: string[] = [];
  await withTransaction(async (session) => {
    for (const member of group) {
      const isWinner = member._id.toString() === input.approveTransactionId;
      // Guard: only still-conflicted/pending members are processed (idempotent re-runs safe)
      const fresh = await Transaction.findOne({
        _id: member._id,
        status: { $in: [TransactionStatuses.PENDING, TransactionStatuses.CONFLICT] },
      }).session(session);
      if (!fresh) continue;

      if (isWinner) {
        await Wallet.findByIdAndUpdate(
          fresh.walletId,
          { $inc: { available: fresh.amount } },
          { session },
        );
        fresh.status = TransactionStatuses.APPROVED;
        approved.push(fresh._id.toString());
      } else {
        fresh.status = TransactionStatuses.REJECTED;
        rejected.push(fresh._id.toString());
      }
      fresh.processedBy = new Types.ObjectId(actor.id);
      fresh.processedAt = new Date();
      fresh.adminNote = input.note;
      await fresh.save({ session });
    }
  });

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'conflict.resolved',
    targetType: 'conflict_group',
    targetId: conflictGroupId,
    metadata: { approved, rejected, justification: input.note },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  for (const id of approved) {
    const tx = await Transaction.findById(id);
    if (tx) {
      await notifyUser({
        userId: String(tx.userId),
        type: 'DEPOSIT_APPROVED',
        title: 'Deposit approved after conflict review',
        body: `৳${toBdt(tx.amount).toFixed(2)} credited. ${input.note}`,
        data: { transactionId: id },
      });
    }
  }
  for (const id of rejected) {
    const tx = await Transaction.findById(id);
    if (tx) {
      await notifyUser({
        userId: String(tx.userId),
        type: 'DEPOSIT_REJECTED',
        title: 'Deposit rejected after conflict review',
        body: input.note,
        data: { transactionId: id },
      });
    }
  }

  return { approved, rejected };
}

export async function listMyTransactions(
  userId: string,
  query: { type?: TransactionType; status?: TransactionStatus; page: number; limit: number },
) {
  const filter: Record<string, unknown> = { userId };
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Transaction.countDocuments(filter),
  ]);
  return {
    transactions: transactions.map((t) => ({ ...t, amountBdt: toBdt(t.amount) })),
    total,
    page: query.page,
    pages: Math.ceil(total / query.limit),
  };
}

export async function listAdminTransactions(
  query: { type?: TransactionType; status?: TransactionStatus; userId?: string; page: number; limit: number },
) {
  const filter: Record<string, unknown> = {};
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.userId) filter.userId = query.userId;
  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('userId', 'name email')
      .lean(),
    Transaction.countDocuments(filter),
  ]);
  return {
    transactions: transactions.map((t) => ({ ...t, amountBdt: toBdt(t.amount) })),
    total,
    page: query.page,
    pages: Math.ceil(total / query.limit),
  };
}

/** Conflict groups for the dedicated Conflict Resolution screen. */
export async function listConflictGroups() {
  const conflicted = await Transaction.find({ status: TransactionStatuses.CONFLICT })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('userId', 'name email')
    .lean();

  const groups = new Map<string, typeof conflicted>();
  for (const tx of conflicted) {
    const key = tx.conflictGroupId ?? String(tx._id);
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([conflictGroupId, deposits]) => ({
    conflictGroupId,
    deposits: deposits.map((d) => ({ ...d, amountBdt: toBdt(d.amount) })),
  }));
}

/** Fired after a deposit with a receipt is created. OCR then AI analysis. */
async function processReceipt(txId: string) {
  try {
    const { processDepositReceipt } = await import('../../shared/utils/receiptPipeline.js');
    await processDepositReceipt(txId);
  } catch {
    // OCR is best-effort; admin can still review manually
  }
}

export async function getTransactionDetail(txId: string) {
  const tx = await Transaction.findById(txId).populate('userId', 'name email phone kycStatus').lean();
  if (!tx) throw ApiError.notFound('Transaction not found');
  return { ...tx, amountBdt: toBdt(tx.amount) };
}
