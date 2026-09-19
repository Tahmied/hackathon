import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
import permissionsRoutes from '../modules/permissions/permissions.routes.js';
import auditRoutes from '../modules/audit/audit.routes.js';
import notificationsRoutes from '../modules/notifications/notifications.routes.js';
import marketRoutes from '../modules/market/market.routes.js';
import walletsRoutes from '../modules/wallets/wallets.routes.js';
import tradesRoutes from '../modules/trades/trades.routes.js';
import transactionsRoutes from '../modules/transactions/transactions.routes.js';
import kycRoutes from '../modules/kyc/kyc.routes.js';
import ticketsRoutes from '../modules/tickets/tickets.routes.js';
import uploadsRoutes from '../modules/uploads/uploads.routes.js';
import chatRoutes from '../modules/chat/chat.routes.js';
import aiRoutes from '../modules/ai/ai.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import devtoolsRoutes from '../modules/devtools/devtools.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'OK', data: { uptime: process.uptime() } });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/audit', auditRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/market', marketRoutes);
router.use('/wallets', walletsRoutes);
router.use('/trades', tradesRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/kyc', kycRoutes);
router.use('/tickets', ticketsRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/chat', chatRoutes);
router.use('/ai', aiRoutes);
router.use('/admin', adminRoutes);
router.use('/devtools', devtoolsRoutes);

export default router;
