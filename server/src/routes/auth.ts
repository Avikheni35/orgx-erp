import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/token';
import { hashToken, compareTokenHash } from '../utils/crypto';
import { sendEmail } from '../utils/email';
import { env } from '../config/env';

const router = Router();
const MAX_REFRESH_TOKENS = 5;
const OTP_ROLES = ['erp_admin', 'erp_accountant'];

// ── Login ────────────────────────────────────────────────────────────────────
router.post(
  '/login',
  validate(z.object({ email: z.string().email(), password: z.string(), tenantCode: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { email, password, tenantCode } = req.body as { email: string; password: string; tenantCode?: string };

    let tenantId: string | null = null;
    if (tenantCode) {
      const tenant = await Tenant.findOne({ loginCode: tenantCode.toLowerCase() }).lean();
      if (!tenant) throw new AppError('Tenant not found', 404);
      tenantId = tenant._id.toString();
    }

    const user = await User.findOne({ email: email.toLowerCase(), tenantId });
    if (!user || !user.passwordHash) throw new AppError('Invalid credentials', 401);
    if (user.status !== 'active') throw new AppError('Account is not active', 403);
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError('Account is locked. Try again later.', 423);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= env.MAX_FAILED_LOGINS) {
        user.lockedUntil = new Date(Date.now() + env.ACCOUNT_LOCK_MINUTES * 60_000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      throw new AppError('Invalid credentials', 401);
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();

    const tenant = tenantId ? await Tenant.findById(tenantId).lean() : null;
    if (OTP_ROLES.includes(user.role) && tenant && env.NODE_ENV !== 'development') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.emailOtpHash = hashToken(otp);
      user.emailOtpExpires = new Date(Date.now() + 10 * 60_000);
      await user.save();
      await sendEmail({
        to: user.email,
        subject: `Ihr Einmalpasswort — ${env.APP_NAME} ERP`,
        html: `<p>Ihr OTP: <strong>${otp}</strong> (10 Minuten gültig)</p>`,
      });
      return res.json({ requiresOtp: true });
    }

    const tokenFamily = crypto.randomUUID();
    const refreshToken = signRefreshToken({ userId: user._id.toString(), tokenFamily });
    const refreshHash = hashToken(refreshToken);
    user.refreshTokenHashes = [...(user.refreshTokenHashes || []).slice(-(MAX_REFRESH_TOKENS - 1)), refreshHash];
    await user.save();

    const accessToken = signAccessToken({ userId: user._id.toString(), tenantId, role: user.role as never });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({ accessToken, user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, tenantId, language: user.language } });
  })
);

// ── Verify OTP ───────────────────────────────────────────────────────────────
router.post(
  '/verify-otp',
  validate(z.object({ email: z.string().email(), otp: z.string().length(6), tenantCode: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { email, otp, tenantCode } = req.body as { email: string; otp: string; tenantCode?: string };

    let tenantId: string | null = null;
    if (tenantCode) {
      const tenant = await Tenant.findOne({ loginCode: tenantCode.toLowerCase() }).lean();
      if (!tenant) throw new AppError('Tenant not found', 404);
      tenantId = tenant._id.toString();
    }

    const user = await User.findOne({ email: email.toLowerCase(), tenantId });
    if (!user || !user.emailOtpHash) throw new AppError('Invalid OTP request', 400);
    if (!user.emailOtpExpires || user.emailOtpExpires < new Date()) throw new AppError('OTP expired', 400);
    if (!compareTokenHash(otp, user.emailOtpHash)) throw new AppError('Invalid OTP', 400);

    user.emailOtpHash = undefined;
    user.emailOtpExpires = undefined;
    user.lastLoginAt = new Date();

    const tokenFamily = crypto.randomUUID();
    const refreshToken = signRefreshToken({ userId: user._id.toString(), tokenFamily });
    const refreshHash = hashToken(refreshToken);
    user.refreshTokenHashes = [...(user.refreshTokenHashes || []).slice(-(MAX_REFRESH_TOKENS - 1)), refreshHash];
    await user.save();

    const accessToken = signAccessToken({ userId: user._id.toString(), tenantId, role: user.role as never });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({ accessToken, user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, tenantId, language: user.language } });
  })
);

// ── Refresh Token ─────────────────────────────────────────────────────────────
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (!token) throw new AppError('No refresh token', 401);

    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = await User.findById(payload.userId);
    if (!user) throw new AppError('User not found', 401);

    const hash = hashToken(token);
    if (!(user.refreshTokenHashes || []).includes(hash)) {
      user.refreshTokenHashes = [];
      await user.save();
      throw new AppError('Token reuse detected — all sessions revoked', 401);
    }

    const newRefreshToken = signRefreshToken({ userId: user._id.toString(), tokenFamily: payload.tokenFamily });
    const newHash = hashToken(newRefreshToken);
    user.refreshTokenHashes = (user.refreshTokenHashes || []).filter((h) => h !== hash);
    user.refreshTokenHashes = [...user.refreshTokenHashes.slice(-(MAX_REFRESH_TOKENS - 1)), newHash];
    await user.save();

    const tenantId = user.tenantId?.toString() ?? null;
    const accessToken = signAccessToken({ userId: user._id.toString(), tenantId, role: user.role as never });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({ accessToken });
  })
);

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.userId).select('-passwordHash -refreshTokenHashes -emailOtpHash -magicLinkTokenHash');
  if (!user) throw new AppError('User not found', 404);
  res.json(user);
}));

// PATCH /me — update own profile (name + language)
router.patch(
  '/me',
  requireAuth,
  validate(z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    language: z.enum(['de', 'en']).optional(),
  })),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.userId);
    if (!user) throw new AppError('User not found', 404);
    if (req.body.firstName !== undefined) user.firstName = req.body.firstName;
    if (req.body.lastName  !== undefined) user.lastName  = req.body.lastName;
    if (req.body.language  !== undefined) user.language  = req.body.language;
    await user.save();
    res.json({ message: 'Profil aktualisiert.' });
  })
);

// POST /me/change-password
router.post(
  '/me/change-password',
  requireAuth,
  validate(z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  })),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.userId);
    if (!user || !user.passwordHash) throw new AppError('User not found', 404);

    const valid = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!valid) throw new AppError('Aktuelles Passwort ist falsch.', 400);

    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    user.refreshTokenHashes = []; // invalidate all sessions
    await user.save();
    res.json({ message: 'Passwort geändert. Bitte erneut anmelden.' });
  })
);

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    const user = await User.findOne({ refreshTokenHashes: hashToken(token) });
    if (user) {
      user.refreshTokenHashes = (user.refreshTokenHashes || []).filter((h) => h !== hashToken(token));
      await user.save();
    }
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logged out' });
}));

// ── Password Reset Request ────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  validate(z.object({ email: z.string().email(), tenantCode: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { email, tenantCode } = req.body as { email: string; tenantCode?: string };
    let tenantId: string | null = null;
    if (tenantCode) {
      const t = await Tenant.findOne({ loginCode: tenantCode.toLowerCase() }).lean();
      if (t) tenantId = t._id.toString();
    }
    const user = await User.findOne({ email: email.toLowerCase(), tenantId });
    if (user) {
      const raw = crypto.randomBytes(32).toString('hex');
      user.passwordResetTokenHash = hashToken(raw);
      user.passwordResetExpires = new Date(Date.now() + 30 * 60_000);
      await user.save();
      const link = `${env.CLIENT_URL}/reset-password/${raw}`;
      await sendEmail({
        to: user.email,
        subject: `Passwort zurücksetzen — ${env.APP_NAME} ERP`,
        html: `<p><a href="${link}">Passwort zurücksetzen</a> (30 Minuten gültig)</p>`,
      });
    }
    res.json({ message: 'If this email exists, a reset link has been sent.' });
  })
);

// ── Reset Password ────────────────────────────────────────────────────────────
router.post(
  '/reset-password/:token',
  validate(z.object({ password: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const hash = hashToken(req.params.token);
    const user = await User.findOne({ passwordResetTokenHash: hash, passwordResetExpires: { $gt: new Date() } });
    if (!user) throw new AppError('Invalid or expired reset link', 400);
    user.passwordHash = await bcrypt.hash(req.body.password, env.BCRYPT_ROUNDS);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokenHashes = [];
    await user.save();
    res.json({ message: 'Password updated successfully.' });
  })
);

export default router;
