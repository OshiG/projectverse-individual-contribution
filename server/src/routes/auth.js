'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, execute, transaction } = require('../db');
const { signAccessToken, requireAuth, loadUser } = require('../middleware/auth');
const crypto = require('crypto');
const { wrap, uuid, badRequest, conflict, unauthorized, logActivity } = require('../lib/helpers');

const router = express.Router();

const ROLE_IDS = { student: 1, researcher: 2, university: 3, business: 4, investor: 5 };

const registerSchema = z.object({
  fullName: z.string().min(3).max(120),
  email: z.string().email().max(160),
  password: z.string().min(8).max(72),
  role: z.enum(['student', 'researcher', 'university', 'business', 'investor']),
  universityId: z.number().int().positive().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  // role extensions
  studentNumber: z.string().regex(/^[0-9]*$/, 'Student number must contain numbers only').max(40).optional(),
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits'),
  degreeProgram: z.string().max(160).optional(),
  faculty: z.string().max(120).optional(),
  designation: z.string().max(120).optional(),
  researchField: z.string().max(160).optional(),
  companyName: z.string().max(160).optional(),
  industry: z.string().max(120).optional(),
  firmName: z.string().max(160).optional(),
  investorType: z.enum(['angel', 'vc', 'corporate', 'grant_body', 'individual']).optional(),
  officialRole: z.string().max(120).optional(),
});

router.post(
  '/register',
  wrap(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, 'validation');
    const d = parsed.data;

    d.email = d.email.trim().toLowerCase();
    const existing = await one('SELECT id FROM users WHERE email = ? LIMIT 1', [d.email]);
    if (existing) throw conflict('That email is already registered', 'email_taken');

    if ((d.role === 'student' || d.role === 'researcher' || d.role === 'university') && !d.universityId) {
      throw badRequest('Choose your university to continue', 'university_required');
    }
    if (d.role === 'business' && !d.companyName) throw badRequest('Company name is required', 'validation');

    const hash = await bcrypt.hash(d.password, 10);
    const pinHash = await bcrypt.hash(d.pin, 10);

    const userId = await transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO users (uuid, role_id, university_id, full_name, email, password_hash, pin_hash, phone,
                            account_status, verification_status)
         VALUES (?,?,?,?,?,?,?, ?, 'active', ?)`,
        [
          uuid(), ROLE_IDS[d.role], d.universityId || null, d.fullName, d.email, hash, pinHash,
          d.phone || null,
          ['student', 'researcher', 'university'].includes(d.role) ? 'pending' : 'unverified',
        ]
      );
      const id = result.insertId;

      if (d.role === 'student') {
        await conn.execute(
          `INSERT INTO student_profiles (user_id, student_number, faculty, degree_program) VALUES (?,?,?,?)`,
          [id, d.studentNumber || null, d.faculty || null, d.degreeProgram || null]
        );
      } else if (d.role === 'researcher') {
        await conn.execute(
          `INSERT INTO researcher_profiles (user_id, designation, research_field) VALUES (?,?,?)`,
          [id, d.designation || null, d.researchField || null]
        );
      } else if (d.role === 'university') {
        await conn.execute(
          `INSERT INTO university_profiles (user_id, official_role) VALUES (?,?)`,
          [id, d.officialRole || null]
        );
      } else if (d.role === 'business') {
        await conn.execute(
          `INSERT INTO business_profiles (user_id, company_name, industry) VALUES (?,?,?)`,
          [id, d.companyName, d.industry || null]
        );
      } else if (d.role === 'investor') {
        await conn.execute(
          `INSERT INTO investor_profiles (user_id, firm_name, investor_type) VALUES (?,?,?)`,
          [id, d.firmName || null, d.investorType || 'individual']
        );
      }

      // Members of a university queue for verification by their own institution.
      if (['student', 'researcher', 'university'].includes(d.role) && d.universityId) {
        await conn.execute(
          `INSERT INTO verification_requests (user_id, university_id, note) VALUES (?,?,?)`,
          [id, d.universityId, 'Created at registration']
        );
      }
      return id;
    });

    const user = await loadUser(userId);
    req.user = user;
    await logActivity(req, 'auth.register', 'user', userId);
    res.status(201).json({ token: signAccessToken(user), user });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1), pin: z.string().regex(/^\d{4,8}$/) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Enter your email and password', 'validation');

    const row = await one(
      `SELECT u.id, u.password_hash, u.pin_hash, u.account_status
         FROM users u WHERE u.email = ? AND u.deleted_at IS NULL LIMIT 1`,
      [parsed.data.email]
    );
    // Same message either way — never confirm which half was wrong.
    if (!row) throw unauthorized('Email or password is incorrect');
    const ok = await bcrypt.compare(parsed.data.password, row.password_hash);
    if (!ok) throw unauthorized('Email, password or PIN is incorrect');
    if (row.pin_hash) {
      if (!(await bcrypt.compare(parsed.data.pin, row.pin_hash))) throw unauthorized('Email, password or PIN is incorrect');
    } else {
      // One-time enrollment for accounts created before PIN verification was introduced.
      await execute('UPDATE users SET pin_hash = ? WHERE id = ? AND pin_hash IS NULL', [await bcrypt.hash(parsed.data.pin, 10), row.id]);
    }
    if (row.account_status === 'suspended') throw unauthorized('This account is suspended. Contact support.');

    await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);
    const user = await loadUser(row.id);
    req.user = user;
    await logActivity(req, 'auth.login', 'user', row.id);
    res.json({ token: signAccessToken(user), user });
  })
);

// Password reset uses single-use, expiring tokens. In development the token is returned
// for local testing; production deployments should deliver it through their email provider.
router.post('/forgot-password', wrap(async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter a valid email address', 'validation');
  const user = await one('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [parsed.data.email.trim().toLowerCase()]);
  const response = { message: 'If that email is registered, password reset instructions will be provided.' };
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 30 MINUTE))', [user.id, tokenHash]);
    if (process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.PASSWORD_RESET_BASE_URL) {
      const resetUrl = `${process.env.PASSWORD_RESET_BASE_URL}?token=${encodeURIComponent(token)}`;
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [parsed.data.email], subject: 'Reset your ProjectVerse password', text: `Use this link within 30 minutes to reset your password: ${resetUrl}` }),
      });
      if (!mail.ok) console.error('Password reset email provider returned status', mail.status);
    } else if (process.env.NODE_ENV !== 'production') {
      response.resetToken = token; // local development/testing only
    } else {
      console.error('Password reset email is not configured: set RESEND_API_KEY, MAIL_FROM and PASSWORD_RESET_BASE_URL.');
    }
  }
  res.json(response);
}));

router.post('/reset-password', wrap(async (req, res) => {
  const parsed = z.object({ token: z.string().min(32), newPassword: z.string().min(8).max(72) }).safeParse(req.body);
  if (!parsed.success) throw badRequest('Provide a valid reset token and a password of at least 8 characters', 'validation');
  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const reset = await one('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1', [tokenHash]);
  if (!reset) throw badRequest('This password reset link is invalid or expired', 'invalid_reset_token');
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(parsed.data.newPassword, 10), reset.user_id]);
  await execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [reset.id]);
  await execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [reset.user_id]);
  res.json({ message: 'Password reset successfully. You can now sign in.' });
}));

router.get('/me', requireAuth, wrap(async (req, res) => res.json({ user: req.user })));

router.post('/change-pin', requireAuth, wrap(async (req, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1), newPin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits') }).safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter your current password and a PIN of 4 to 8 digits', 'validation');
  const row = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(parsed.data.currentPassword, row.password_hash))) throw badRequest('Current password is incorrect', 'wrong_password');
  await execute('UPDATE users SET pin_hash = ? WHERE id = ?', [await bcrypt.hash(parsed.data.newPin, 10), req.user.id]);
  res.json({ message: 'PIN updated' });
}));

router.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(72) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest('New password must be at least 8 characters', 'validation');

    const row = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const ok = await bcrypt.compare(parsed.data.currentPassword, row.password_hash);
    if (!ok) throw badRequest('Current password is incorrect', 'wrong_password');

    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [
      await bcrypt.hash(parsed.data.newPassword, 10), req.user.id,
    ]);
    await logActivity(req, 'auth.password_changed', 'user', req.user.id);
    res.json({ message: 'Password changed' });
  })
);

module.exports = router;
