'use strict';
const express      = require('express');
const cookieParser = require('cookie-parser');
const jwt          = require('jsonwebtoken');

const SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

process.env.ACCESS_TOKEN_SECRET  = SECRET;
process.env.REFRESH_TOKEN_SECRET = REFRESH_SECRET;
process.env.BCRYPT_SALT_ROUNDS   = '1';

/**
 * Creates a minimal Express app mounting a feature router under '/'.
 * Includes the global error handler.
 */
function makeApp(featureRouter) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/', featureRouter);
  app.use(require('../src/middleware/error-handler'));
  return app;
}

/** Returns a valid Bearer token for an admin user. */
function adminToken(overrides = {}) {
  return 'Bearer ' + jwt.sign(
    { sub: '1', roles: ['admin'], email: 'admin@test.com', active: true, ...overrides },
    SECRET,
    { expiresIn: '1h' }
  );
}

/** Returns a valid Bearer token for a lawyer user. */
function lawyerToken(overrides = {}) {
  return 'Bearer ' + jwt.sign(
    { sub: '2', roles: ['lawyer'], email: 'lawyer@test.com', active: true, ...overrides },
    SECRET,
    { expiresIn: '1h' }
  );
}

/** Returns a valid Bearer token for a client user. */
function clientToken(overrides = {}) {
  return 'Bearer ' + jwt.sign(
    { sub: '3', roles: ['client'], email: 'client@test.com', active: true, ...overrides },
    SECRET,
    { expiresIn: '1h' }
  );
}

/** Returns a valid refresh token for user id. */
function refreshToken(sub = '1') {
  return jwt.sign({ sub: String(sub), type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' });
}

module.exports = { makeApp, adminToken, lawyerToken, clientToken, refreshToken, SECRET, REFRESH_SECRET };
