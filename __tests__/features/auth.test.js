'use strict';

process.env.ACCESS_TOKEN_SECRET  = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.BCRYPT_SALT_ROUNDS   = '1';

jest.mock('../../src/repositories', () => ({
  users: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateLastLogin: jest.fn(),
    incrementFailedAttempts: jest.fn(),
    lockUntil: jest.fn(),
    resetFailedAttempts: jest.fn(),
    setPasswordReset: jest.fn(),
    updatePassword: jest.fn(),
    setEmailVerified: jest.fn(),
  },
}));

jest.mock('../../src/db/client', () => ({
  getDb: jest.fn(),
  withUser: jest.fn(),
}));

const request   = require('supertest');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const { makeApp, adminToken, refreshToken } = require('../helpers');
const repos     = require('../../src/repositories');
const dbClient  = require('../../src/db/client');

const app = makeApp(require('../../src/features/auth'));

// ─── Register ──────────────────────────────────────────────────────────────

describe('POST /register', () => {
  it('returns 201 and pending activation message', async () => {
    repos.users.findByEmail.mockResolvedValue(null);
    repos.users.create.mockResolvedValue({ id: 1, nombre: 'Ana', email: 'ana@test.com', active: false });

    const res = await request(app).post('/register').send({
      nombre: 'Ana', email: 'ana@test.com', password: 'secret123',
    });

    expect(res.status).toBe(201);
    expect(res.body.pendingActivation).toBe(true);
    expect(res.body.user.email).toBe('ana@test.com');
    expect(repos.users.create).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when email already exists', async () => {
    repos.users.findByEmail.mockResolvedValue({ id: 1, email: 'ana@test.com' });

    const res = await request(app).post('/register').send({
      nombre: 'Ana', email: 'ana@test.com', password: 'secret123',
    });

    expect(res.status).toBe(409);
    expect(repos.users.create).not.toHaveBeenCalled();
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app).post('/register').send({
      nombre: 'Ana', email: 'not-an-email', password: 'secret123',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app).post('/register').send({
      nombre: 'Ana', email: 'ana@test.com', password: '1234',
    });
    expect(res.status).toBe(400);
  });
});

// ─── Login ─────────────────────────────────────────────────────────────────

describe('POST /login', () => {
  let passwordHash;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('secret123', 1);
  });

  it('returns 200 with accessToken on valid credentials', async () => {
    repos.users.findByEmail.mockResolvedValue({
      id: 1, nombre: 'Ana', email: 'ana@test.com',
      password_hash: passwordHash, active: true,
      locked_until: null, roles: [{ nombre: 'admin' }],
    });
    repos.users.resetFailedAttempts.mockResolvedValue();
    repos.users.updateLastLogin.mockResolvedValue();

    const res = await request(app).post('/login').send({ email: 'ana@test.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('ana@test.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 when user not found', async () => {
    repos.users.findByEmail.mockResolvedValue(null);

    const res = await request(app).post('/login').send({ email: 'nope@test.com', password: 'secret123' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when password is wrong', async () => {
    repos.users.findByEmail.mockResolvedValue({
      id: 1, email: 'ana@test.com', password_hash: passwordHash,
      active: true, locked_until: null, roles: [],
    });
    repos.users.incrementFailedAttempts.mockResolvedValue(1);

    const res = await request(app).post('/login').send({ email: 'ana@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(repos.users.incrementFailedAttempts).toHaveBeenCalled();
  });

  it('returns 403 when account is inactive', async () => {
    repos.users.findByEmail.mockResolvedValue({
      id: 1, email: 'ana@test.com', password_hash: passwordHash,
      active: false, locked_until: null, roles: [],
    });

    const res = await request(app).post('/login').send({ email: 'ana@test.com', password: 'secret123' });

    expect(res.status).toBe(403);
  });

  it('returns 423 when account is locked', async () => {
    repos.users.findByEmail.mockResolvedValue({
      id: 1, email: 'ana@test.com', password_hash: passwordHash,
      active: true, locked_until: new Date(Date.now() + 60000), roles: [],
    });

    const res = await request(app).post('/login').send({ email: 'ana@test.com', password: 'secret123' });

    expect(res.status).toBe(423);
  });

  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/login').send({});
    expect(res.status).toBe(400);
  });
});

// ─── Logout ────────────────────────────────────────────────────────────────

describe('POST /logout', () => {
  it('returns 200 and clears refreshToken cookie', async () => {
    const res = await request(app).post('/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logout/i);
  });
});

// ─── Me ────────────────────────────────────────────────────────────────────

describe('GET /me', () => {
  it('returns 200 with user data when authenticated', async () => {
    repos.users.findById.mockResolvedValue({
      id: 1, nombre: 'Ana', email: 'ana@test.com', active: true, roles: [],
    });

    const res = await request(app).get('/me').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Ana');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  it('returns 404 when user no longer exists', async () => {
    repos.users.findById.mockResolvedValue(null);

    const res = await request(app).get('/me').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

// ─── Refresh ───────────────────────────────────────────────────────────────

describe('POST /refresh', () => {
  it('returns 200 with new accessToken when cookie is valid', async () => {
    repos.users.findById.mockResolvedValue({
      id: 1, nombre: 'Ana', email: 'ana@test.com', active: true,
      roles: [{ nombre: 'admin' }],
    });

    const token = refreshToken('1');
    const res = await request(app).post('/refresh').set('Cookie', `refreshToken=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('returns 401 without refresh cookie', async () => {
    const res = await request(app).post('/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid refresh token', async () => {
    const res = await request(app).post('/refresh').set('Cookie', 'refreshToken=invalid.token.here');
    expect(res.status).toBe(401);
  });
});

// ─── Forgot Password ───────────────────────────────────────────────────────

describe('POST /forgot-password', () => {
  it('returns 200 regardless of whether email exists (security)', async () => {
    repos.users.findByEmail.mockResolvedValue(null);
    const res = await request(app).post('/forgot-password').send({ email: 'any@test.com' });
    expect(res.status).toBe(200);
  });

  it('calls setPasswordReset when user exists', async () => {
    repos.users.findByEmail.mockResolvedValue({ id: 5, email: 'u@test.com' });
    repos.users.setPasswordReset.mockResolvedValue();

    await request(app).post('/forgot-password').send({ email: 'u@test.com' });
    expect(repos.users.setPasswordReset).toHaveBeenCalledWith(5, expect.any(String), expect.any(Date));
  });

  it('returns 400 with invalid email', async () => {
    const res = await request(app).post('/forgot-password').send({ email: 'notanemail' });
    expect(res.status).toBe(400);
  });
});

// ─── Reset Password ────────────────────────────────────────────────────────

describe('POST /reset-password', () => {
  it('returns 200 when token is valid', async () => {
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
    dbClient.getDb.mockResolvedValue(mockDb);
    repos.users.updatePassword.mockResolvedValue({ id: 1 });

    const res = await request(app).post('/reset-password').send({ token: 'valid-token', password: 'newpass123' });

    expect(res.status).toBe(200);
  });

  it('returns 400 when token is invalid or expired', async () => {
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    dbClient.getDb.mockResolvedValue(mockDb);

    const res = await request(app).post('/reset-password').send({ token: 'bad-token', password: 'newpass123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app).post('/reset-password').send({ token: 'tok', password: '123' });
    expect(res.status).toBe(400);
  });
});

// ─── Verify Email ──────────────────────────────────────────────────────────

describe('GET /verify-email', () => {
  it('returns 200 when token is valid', async () => {
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
    dbClient.getDb.mockResolvedValue(mockDb);
    repos.users.setEmailVerified.mockResolvedValue();

    const res = await request(app).get('/verify-email?token=valid-token');

    expect(res.status).toBe(200);
  });

  it('returns 400 when token is missing', async () => {
    const res = await request(app).get('/verify-email');
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is expired', async () => {
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    dbClient.getDb.mockResolvedValue(mockDb);

    const res = await request(app).get('/verify-email?token=expired');
    expect(res.status).toBe(400);
  });
});
