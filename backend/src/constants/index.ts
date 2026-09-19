export const WalletTypes = {
  MAIN: 'MAIN',
  DEMO: 'DEMO',
} as const;
export type WalletType = (typeof WalletTypes)[keyof typeof WalletTypes];

export const KycStatuses = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;
export type KycStatus = (typeof KycStatuses)[keyof typeof KycStatuses];

export const TransactionTypes = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
} as const;
export type TransactionType = (typeof TransactionTypes)[keyof typeof TransactionTypes];

export const TransactionStatuses = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONFLICT: 'CONFLICT',
  INFO_REQUESTED: 'INFO_REQUESTED',
} as const;
export type TransactionStatus =
  (typeof TransactionStatuses)[keyof typeof TransactionStatuses];

export const PaymentMethods = ['BKASH', 'NAGAD', 'ROCKET', 'BANK'] as const;
export type PaymentMethod = (typeof PaymentMethods)[number];

export const TradeStatuses = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type TradeStatus = (typeof TradeStatuses)[keyof typeof TradeStatuses];

export const TradeSides = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;
export type TradeSide = (typeof TradeSides)[keyof typeof TradeSides];

export const CloseReasons = {
  MANUAL: 'MANUAL',
  STOP_OUT: 'STOP_OUT',
  ADMIN: 'ADMIN',
} as const;
export type CloseReason = (typeof CloseReasons)[keyof typeof CloseReasons];

export const TicketStatuses = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type TicketStatus = (typeof TicketStatuses)[keyof typeof TicketStatuses];

export const ConversationChannels = {
  AI: 'AI',
  HUMAN: 'HUMAN',
} as const;
export type ConversationChannel =
  (typeof ConversationChannels)[keyof typeof ConversationChannels];

export const ConversationStatuses = {
  BOT: 'BOT',
  HUMAN: 'HUMAN',
  CLOSED: 'CLOSED',
} as const;
export type ConversationStatus =
  (typeof ConversationStatuses)[keyof typeof ConversationStatuses];

export const ChatSenderTypes = {
  USER: 'USER',
  AGENT: 'AGENT',
  AI: 'AI',
  SYSTEM: 'SYSTEM',
} as const;
export type ChatSenderType = (typeof ChatSenderTypes)[keyof typeof ChatSenderTypes];

export const AssetCategories = {
  CRYPTO: 'CRYPTO',
  FOREX: 'FOREX',
  COMMODITY: 'COMMODITY',
} as const;
export type AssetCategory = (typeof AssetCategories)[keyof typeof AssetCategories];

/** Socket.io event names (shared by server + clients). */
export const SocketEvents = {
  TICK: 'market:tick',
  CANDLE: 'market:candle',
  MARKET_STALE: 'market:stale',
  MARKET_RECOVERED: 'market:recovered',
  NOTIFICATION: 'notification:new',
  TX_UPDATE: 'transaction:update',
  TRADE_CLOSED: 'trade:closed',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  CONVERSATION_NEW: 'conversation:new',
  CONVERSATION_UPDATED: 'conversation:updated',
} as const;

export const OtpPurposes = {
  LOGIN: 'LOGIN',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMAIL_VERIFY: 'EMAIL_VERIFY',
} as const;
export type OtpPurpose = (typeof OtpPurposes)[keyof typeof OtpPurposes];
