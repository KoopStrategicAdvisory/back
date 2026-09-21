'use strict';
// Seguridad: un usuario cuyo ÚNICO rol es 'cliente' solo puede ver lo suyo.
// Es la barrera que evita que un cliente lea el expediente, las tareas o los
// documentos de otro cambiando un id en la URL o en la query.

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  expedientes: { findAll: jest.fn(), count: jest.fn(), findById: jest.fn() },
  tareas: { findAll: jest.fn(), count: jest.fn() },
  documentos: { findAll: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../src/services/s3', () => ({ getSignedDownloadUrl: jest.fn() }));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken, clientToken } = require('../helpers');
const repos = require('../../src/repositories');
const s3 = require('../../src/services/s3');
const { isClientOnly } = require('../../src/middleware/clientScope');

const expedientesApp = makeApp(require('../../src/features/expedientes'));
const tareasApp = makeApp(require('../../src/features/tareas'));
const documentosApp = makeApp(require('../../src/features/documentos'));

const MI_CLIENTE = 5;
const OTRO_CLIENTE = 9;
const miToken = () => clientToken({ id_cliente: MI_CLIENTE });
const EXP_MIO = { id: 10, id_cliente: MI_CLIENTE, numero_de_expediente: 'KOOP-2026-10' };
const EXP_AJENO = { id: 20, id_cliente: OTRO_CLIENTE, numero_de_expediente: 'KOOP-2026-20' };

beforeEach(() => {
  // (resetMocks está activo: las implementaciones se fijan aquí, en cada prueba)
  s3.getSignedDownloadUrl.mockResolvedValue('https://s3.example/firmada');
  repos.expedientes.findById.mockImplementation(async (id) => ({ 10: EXP_MIO, 20: EXP_AJENO })[id] ?? null);
  repos.expedientes.findAll.mockResolvedValue([]);
  repos.expedientes.count.mockResolvedValue(0);
  repos.tareas.findAll.mockResolvedValue([]);
  repos.tareas.count.mockResolvedValue(0);
  repos.documentos.findAll.mockResolvedValue([]);
});

describe('isClientOnly', () => {
  const con = (roles) => isClientOnly({ user: { roles } });
  test('solo-cliente → true', () => expect(con(['cliente'])).toBe(true));
  test('cliente que además es abogado → false (es personal de la firma)', () => expect(con(['cliente', 'abogado'])).toBe(false));
  test.each([['abogado'], ['admin'], ['socio'], ['super_admin']])('%s → false', (rol) => expect(con([rol])).toBe(false));
  test('sin roles → false', () => expect(con([])).toBe(false));
});

describe('Expedientes', () => {
  test('la lista de un cliente se fuerza a SU cliente, aunque pida otro por la query', async () => {
    const res = await request(expedientesApp).get(`/?id_cliente=${OTRO_CLIENTE}`).set('Authorization', miToken());

    expect(res.status).toBe(200);
    expect(repos.expedientes.findAll).toHaveBeenCalledWith(expect.objectContaining({ id_cliente: MI_CLIENTE }));
    expect(repos.expedientes.count).toHaveBeenCalledWith(expect.objectContaining({ id_cliente: MI_CLIENTE }));
  });

  test('un cliente sin ficha de cliente vinculada → 403', async () => {
    const res = await request(expedientesApp).get('/').set('Authorization', clientToken());
    expect(res.status).toBe(403);
    expect(repos.expedientes.findAll).not.toHaveBeenCalled();
  });

  test('ve su propio expediente → 200', async () => {
    expect((await request(expedientesApp).get('/10').set('Authorization', miToken())).status).toBe(200);
  });

  test('el expediente de otro cliente → 404 (no 403: no se revela que existe)', async () => {
    const res = await request(expedientesApp).get('/20').set('Authorization', miToken());
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('numero_de_expediente');
  });

  test('el personal de la firma sí ve cualquiera', async () => {
    for (const token of [adminToken(), lawyerToken()]) {
      expect((await request(expedientesApp).get('/20').set('Authorization', token)).status).toBe(200);
    }
  });
});

describe('Tareas', () => {
  test('exige indicar el expediente → 400', async () => {
    const res = await request(tareasApp).get('/').set('Authorization', miToken());
    expect(res.status).toBe(400);
    expect(repos.tareas.findAll).not.toHaveBeenCalled();
  });

  test('las tareas del expediente de otro cliente → 404 y no se consultan', async () => {
    const res = await request(tareasApp).get(`/?id_expediente=${EXP_AJENO.id}`).set('Authorization', miToken());
    expect(res.status).toBe(404);
    expect(repos.tareas.findAll).not.toHaveBeenCalled();
  });

  test('las de su propio expediente → 200', async () => {
    expect((await request(tareasApp).get(`/?id_expediente=${EXP_MIO.id}`).set('Authorization', miToken())).status).toBe(200);
  });

  test('el personal puede listar sin indicar expediente', async () => {
    expect((await request(tareasApp).get('/').set('Authorization', adminToken())).status).toBe(200);
  });
});

describe('Documentos', () => {
  test('la lista de otro cliente → 404 y no se consulta', async () => {
    const res = await request(documentosApp).get(`/?id_expediente=${EXP_AJENO.id}`).set('Authorization', miToken());
    expect(res.status).toBe(404);
    expect(repos.documentos.findAll).not.toHaveBeenCalled();
  });

  test('un cliente solo recibe documentos marcados como visibles para él', async () => {
    await request(documentosApp).get(`/?id_expediente=${EXP_MIO.id}&visibilidad_cliente=false`).set('Authorization', miToken());
    expect(repos.documentos.findAll).toHaveBeenCalledWith(expect.objectContaining({ visibilidad_cliente: true }));
  });

  test('el enlace de descarga de un documento interno (no visible) → 404', async () => {
    repos.documentos.findById.mockResolvedValue({ id: 1, id_expediente: EXP_MIO.id, visibilidad_cliente: false, url_storage: 'k' });
    expect((await request(documentosApp).get('/1/download-url').set('Authorization', miToken())).status).toBe(404);
  });

  test('el enlace de descarga de un documento de otro cliente → 404', async () => {
    repos.documentos.findById.mockResolvedValue({ id: 2, id_expediente: EXP_AJENO.id, visibilidad_cliente: true, url_storage: 'k' });
    expect((await request(documentosApp).get('/2/download-url').set('Authorization', miToken())).status).toBe(404);
  });

  test('el enlace de descarga de su propio documento visible → 200', async () => {
    repos.documentos.findById.mockResolvedValue({ id: 3, id_expediente: EXP_MIO.id, visibilidad_cliente: true, url_storage: 'k' });
    const res = await request(documentosApp).get('/3/download-url').set('Authorization', miToken());
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://s3.example/firmada');
  });
});
