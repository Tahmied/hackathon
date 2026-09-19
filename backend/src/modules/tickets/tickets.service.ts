import { ApiError } from '../../shared/utils/ApiError.js';
import { Types } from 'mongoose';
import { Ticket, type TicketMessage } from './ticket.model.js';
import { Transaction } from '../transactions/transaction.model.js';
import { Trade } from '../trades/trade.model.js';
import { User } from '../auth/user.model.js';
import { logAudit } from '../audit/audit.model.js';
import { notifyUser } from '../notifications/notifications.service.js';
import { StaffRoles } from '../../constants/roles.js';

export async function createTicket(
  userId: string,
  input: { subject: string; body: string; attachments?: string[]; linkedTransactionIds?: string[] },
) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const ticket = await Ticket.create({
    userId,
    subject: input.subject,
    status: 'OPEN',
    messages: [
      {
        senderId: user._id,
        senderRole: user.role,
        senderName: user.name,
        body: input.body,
        attachments: input.attachments ?? [],
      },
    ],
    linkedTransactionIds: (input.linkedTransactionIds ?? []).map((id) => new Types.ObjectId(id)),
  });

  await logAudit({
    actorId: userId,
    actorRole: user.role,
    action: 'ticket.created',
    targetType: 'ticket',
    targetId: ticket._id,
    metadata: { userId, subject: input.subject },
  });
  return ticket;
}

export async function listMyTickets(userId: string) {
  return Ticket.find({ userId }).sort({ updatedAt: -1 }).limit(50).lean();
}

export async function listAllTickets(filter: { status?: string; page: number; limit: number }) {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  const [tickets, total] = await Promise.all([
    Ticket.find(query)
      .sort({ updatedAt: -1 })
      .skip((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .populate('userId', 'name email kycStatus')
      .lean(),
    Ticket.countDocuments(query),
  ]);
  return { tickets, total, page: filter.page, pages: Math.ceil(total / filter.limit) };
}

async function assertTicketAccess(ticket: { userId: unknown }, userId: string, role: string) {
  const isOwner = String(ticket.userId) === userId;
  const isStaff = role !== 'user';
  if (!isOwner && !isStaff) throw ApiError.forbidden('Not allowed');
}

export async function getTicket(ticketId: string, viewer: { id: string; role: string }) {
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw ApiError.notFound('Ticket not found');
  await assertTicketAccess(ticket, viewer.id, viewer.role);
  if (viewer.role === 'user') {
    // users must not see internal notes
    ticket.messages = ticket.messages.filter((m: TicketMessage) => !m.isInternalNote);
  }
  return ticket;
}

/** Admin sidebar context: recent transactions and trades for the ticket's user. */
export async function getTicketUserContext(ticketId: string) {
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw ApiError.notFound('Ticket not found');
  const [transactions, trades, user] = await Promise.all([
    Transaction.find({ userId: ticket.userId }).sort({ createdAt: -1 }).limit(10).lean(),
    Trade.find({ userId: ticket.userId }).sort({ createdAt: -1 }).limit(10).lean(),
    User.findById(ticket.userId).select('name email kycStatus createdAt').lean(),
  ]);
  return { user, transactions, trades };
}

export async function addTicketMessage(
  ticketId: string,
  sender: { id: string; role: string; name: string },
  input: { body: string; attachments?: string[]; isInternalNote?: boolean },
) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw ApiError.notFound('Ticket not found');
  await assertTicketAccess(ticket, sender.id, sender.role);

  if (input.isInternalNote && !StaffRoles.includes(sender.role as never)) {
    throw ApiError.forbidden('Only staff can add internal notes');
  }

  ticket.messages.push({
    senderId: sender.id as never,
    senderRole: sender.role,
    senderName: sender.name,
    body: input.body,
    attachments: input.attachments ?? [],
    isInternalNote: input.isInternalNote ?? false,
    createdAt: new Date(),
  });

  if (sender.role !== 'user' && !input.isInternalNote) {
    ticket.status = ticket.status === 'RESOLVED' ? 'RESOLVED' : 'PENDING';
    if (ticket.status === 'PENDING' && !ticket.assignedTo) ticket.assignedTo = sender.id as never;
  }
  if (sender.role === 'user' && ticket.status === 'PENDING') {
    ticket.status = 'OPEN';
  }
  await ticket.save();

  if (!input.isInternalNote) {
    await notifyUser({
      userId: String(ticket.userId),
      type: 'TICKET_REPLY',
      title: `Support replied to "${ticket.subject}"`,
      body: input.body.slice(0, 140),
      data: { ticketId },
    });
  }
  return ticket;
}

export async function setTicketStatus(
  ticketId: string,
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED',
  actor: { id: string; role: string; ip?: string },
) {
  const ticket = await Ticket.findByIdAndUpdate(
    ticketId,
    { $set: { status, resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date() : undefined } },
    { new: true },
  );
  if (!ticket) throw ApiError.notFound('Ticket not found');
  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'ticket.status_changed',
    targetType: 'ticket',
    targetId: ticketId,
    metadata: { status },
    ip: actor.ip,
  });
  return ticket;
}
