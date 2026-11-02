'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { pool } = require('./db');
const { ApiError } = require('./lib/helpers');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Sign-in and registration get a tighter limit than the rest of the API.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api', apiLimiter, require('./routes/general'));
app.use('/api/publications', apiLimiter, require('./routes/publications'));
app.use('/api/requests', apiLimiter, require('./routes/requests'));
app.use('/api/marketplace', apiLimiter, require('./routes/marketplace'));
app.use('/api/subscriptions', apiLimiter, require('./routes/subscriptions'));
app.use('/api/admin', apiLimiter, require('./routes/admin'));
app.use('/api/university', apiLimiter, require('./routes/university'));
app.use('/api/dashboard', apiLimiter, require('./routes/dashboard'));

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}`, code: 'route_not_found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  }
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That record already exists', code: 'duplicate' });
  }
  if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'One of the selected values no longer exists', code: 'bad_reference' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.', code: 'server_error' });
});

module.exports = app;
