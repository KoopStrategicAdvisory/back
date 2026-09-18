'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.BCRYPT_SALT_ROUNDS  = '1';

jest.mock('../../src/repositories', () => ({
  users: {
    findAll:    jest.fn(),
    findById:   jest.fn(),
    findByEmail: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    softDelete: jest.fn(),
    addRole:    jest.fn(),
    removeRole: jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/users'));

const USER = {
  id: 2, nombre: 'Luis López', email: 'luis@test.com', active: true,
  roles: [{ id: 1, nombre: 'lawyer' }],
};

describe('GET /users', () => {
  it('returns 200 with list when admin', async () => {
    repos.users.findAll.mockResolvedValue([USER]);

    const res = await request(app).get('/').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 403 when non-admin requests', async () => {
    const res = await request(app).get('/').set('Authorization', lawyerToken());
    expect(res.status).toBe(403);
  });
});

describe('GET /users/:id', () => {
  it('returns 200 for own profile', async () => {
    repos.users.findById.mockResolvedValue(USER);

    // Token for user id '2', requesting /2
    const { adminToken: _, ...helpers } = require('../helpers');
    const jwt = require('jsonwebtoken');
    const selfToken = 'Bearer ' + jwt.sign(
      { sub: '2', roles: ['lawyer'], email: 'luis@test.com' }, 'test-access-secret'
    );

    const res = await request(app).get('/2').set('Authorization', selfToken);

    expect(res.status).toBe(200);
    expect(res.body.password_hash).toBeUndefined();
  });

  it('returns 200 when admin requests any profile', async () => {
    repos.users.findById.mockResolvedValue(USER);

    const res = await request(app).get('/2').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 403 when lawyer requests another user profile', async () => {
    const jwt = require('jsonwebtoken');
    const differentUserToken = 'Bearer ' + jwt.sign(
      { sub: '5', roles: ['lawyer'], email: 'other@test.com' }, 'test-access-secret'
    );

    const res = await request(app).get('/2').set('Authorization', differentUserToken);
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    repos.users.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /users', () => {
  it('returns 201 when admin creates user', async () => {
    repos.users.findByEmail.mockResolvedValue(null);
    repos.users.create.mockResolvedValue(USER);

    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ nombre: 'Luis López', email: 'luis@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(repos.users.create).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when email already exists', async () => {
    repos.users.findByEmail.mockResolvedValue(USER);

    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ nombre: 'Luis', email: 'luis@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(repos.users.create).not.toHaveBeenCalled();
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ nombre: 'Luis' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when non-admin tries to create', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ nombre: 'X', email: 'x@x.com', password: 'pass1234' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /users/:id', () => {
  it('returns 200 on successful update', async () => {
    repos.users.update.mockResolvedValue({ ...USER, nombre: 'Luis Updated' });

    const res = await request(app)
      .put('/2')
      .set('Authorization', adminToken())
      .send({ nombre: 'Luis Updated' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when user not found', async () => {
    repos.users.update.mockResolvedValue(null);

    const res = await request(app)
      .put('/99')
      .set('Authorization', adminToken())
      .send({ nombre: 'X' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /users/:id', () => {
  it('returns 204 on successful soft delete', async () => {
    repos.users.softDelete.mockResolvedValue({ id: 2 });

    const res = await request(app)
      .delete('/2')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });
});

describe('POST /users/:id/roles', () => {
  it('returns 201 when role added', async () => {
    repos.users.addRole.mockResolvedValue({ id_usuario: 2, id_rol: 1 });

    const res = await request(app)
      .post('/2/roles')
      .set('Authorization', adminToken())
      .send({ id_rol: 1 });

    expect(res.status).toBe(201);
  });

  it('returns 400 when id_rol is missing', async () => {
    const res = await request(app)
      .post('/2/roles')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /users/:id/roles/:rolId', () => {
  it('returns 204 when role removed', async () => {
    repos.users.removeRole.mockResolvedValue({ id_usuario: 2, id_rol: 1 });

    const res = await request(app)
      .delete('/2/roles/1')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });

  it('returns 404 when role not assigned', async () => {
    repos.users.removeRole.mockResolvedValue(null);

    const res = await request(app)
      .delete('/2/roles/99')
      .set('Authorization', adminToken());

    expect(res.status).toBe(404);
  });
});
