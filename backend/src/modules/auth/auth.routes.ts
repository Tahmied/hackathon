import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  googleLoginSchema,
  loginSchema,
  logoutSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.validator.js';
import { authController } from './auth.controller.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests, please try again later' },
});

router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/google', authLimiter, validate({ body: googleLoginSchema }), authController.google);
router.post('/refresh', validate({ body: refreshTokenSchema }), authController.refresh);
router.post('/logout', validate({ body: logoutSchema }), authController.logout);

router.post('/otp/request', otpLimiter, validate({ body: otpRequestSchema }), authController.requestOtp);
router.post('/otp/verify', authLimiter, validate({ body: otpVerifySchema }), authController.verifyOtp);
router.post(
  '/password/reset',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);

router.get('/me', authenticate, authController.me);

export default router;
