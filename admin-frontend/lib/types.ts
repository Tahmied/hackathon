export interface WalletView {
  id: string;
  type: 'MAIN' | 'DEMO';
  available: number;
  reserved: number;
  total: number;
  availableBdt: number;
  reservedBdt: number;
  totalBdt: number;
}

export interface WalletsOverview {
  wallets: WalletView[];
  summary: {
    totalAvailableBdt: number;
    totalReservedBdt: number;
    totalBalanceBdt: number;
  };
}

export interface ReservedBreakdown {
  totalReservedBdt: number;
  wallets: {
    walletId: string;
    walletType: string;
    reservedBdt: number;
    trades: {
      tradeId: string;
      symbol: string;
      side: string;
      marginBdt: number;
      leverage: number;
      entryPrice: number;
      openedAt: string;
    }[];
  }[];
}

export interface AssetView {
  _id: string;
  symbol: string;
  name: string;
  category: string;
  basePrice: number;
  quoteCurrency: string;
  leverageOptions: number[];
  minMarginPaisa: number;
  maxMarginPaisa: number;
  lastPrice: number;
  isActive: boolean;
}

export interface CandleView {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradeView {
  _id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  margin: number;
  leverage: number;
  entryPrice: number;
  closePrice?: number;
  pnl?: number;
  pnlBdt?: number;
  floatingPnlBdt?: number | null;
  floatingPnlPaisa?: number | null;
  currentPrice?: number | null;
  status: 'OPEN' | 'CLOSED';
  walletType: string;
  closeReason?: string;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
}

export interface TransactionView {
  _id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  amountBdt: number;
  method: string;
  walletType?: string;
  accountNumber?: string;
  reference: string;
  receiptUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONFLICT' | 'INFO_REQUESTED';
  adminNote?: string;
  infoRequestNote?: string;
  ocrConfidence?: number;
  ocrUnclear?: boolean;
  extractedData?: { amount?: number | null; reference?: string | null; payer?: string | null };
  aiAnalysis?: {
    available: boolean;
    reason?: string;
    verdict?: string;
    issues?: string[];
    summary?: string;
  };
  conflictGroupId?: string;
  createdAt: string;
  processedAt?: string;
  userId?: { _id?: string; name?: string; email?: string };
}

export interface TimelineEvent {
  at: string;
  kind: string;
  label: string;
  ref?: string;
  detail?: Record<string, unknown>;
}

export interface ChatMessageView {
  id: string;
  conversationId: string;
  senderType: 'USER' | 'AGENT' | 'AI' | 'SYSTEM';
  senderName: string;
  body: string;
  attachments?: string[];
  toolTrace?: { thought: string; tool?: string; args?: Record<string, unknown>; resultSummary?: string }[];
  aiUnavailable?: boolean;
  createdAt: string;
}

export interface ConversationView {
  _id: string;
  channel: 'AI' | 'HUMAN';
  status: 'BOT' | 'HUMAN' | 'CLOSED';
  lastMessage?: string;
  lastMessageAt: string;
  unreadForStaff: number;
  unreadForUser: number;
  userId?: { _id?: string; name?: string; email?: string; kycStatus?: string };
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read?: boolean;
}

export const formatBdt = (bdt: number | null | undefined, decimals = 2) =>
  `৳${(bdt ?? 0).toLocaleString('en-BD', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const formatPrice = (price: number | null | undefined) =>
  price == null
    ? '—'
    : price >= 1000
      ? price.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : price.toLocaleString('en-US', { maximumFractionDigits: 5 });

export const formatDateTime = (iso: string | Date | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
