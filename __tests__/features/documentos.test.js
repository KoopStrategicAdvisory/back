'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  expedientes: { findById: jest.fn() },
  documentos: {
    findAll:    jest.fn(),
    findById:   jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    softDelete: jest.fn(),
  },
}));

// La subida y el borrado hablan con S3: aquí se simulan, nunca se toca el bucket real.
jest.mock('../../src/services/s3', () => ({
  uploadBuffer: jest.fn(),
  deleteObject: jest.fn(),
  documentoPrefix: (n) => `documentos/${n}`,
}));

const request = require('supertest');
const s3 = require('../../src/services/s3');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/documentos'));

const DOCUMENTO = { id: 1, id_expediente: 4, nombre_archivo: 'demanda.pdf', url_s3: 'https://s3.example.com/demanda.pdf' };

describe('GET /documentos', () => {
  it('returns 200 with list', async () => {
    repos.documentos.findAll.mockResolvedValue([DOCUMENTO]);

    const res = await request(app)
      .get('/?id_expediente=4')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.documentos.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_expediente: 4 })
    );
  });

  it('filters by visibilidad_cliente when provided', async () => {
    repos.documentos.findAll.mockResolvedValue([]);

    await request(app)
      .get('/?visibilidad_cliente=true')
      .set('Authorization', adminToken());

    expect(repos.documentos.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ visibilidad_cliente: true })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('GET /documentos/:id', () => {
  it('returns 200 when found', async () => {
    repos.documentos.findById.mockResolvedValue(DOCUMENTO);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body.nombre_archivo).toBe('demanda.pdf');
  });

  it('returns 404 when not found', async () => {
    repos.documentos.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /documentos', () => {
  const EXPEDIENTE = { id: 4, numero_de_expediente: 'KOOP-2026-4' };
  // Subida real: multipart con el archivo + campos, como la hace el front.
  const subir = (token, campos = { id_expediente: '4', id_tipo_documento: '1' }, { archivo = true } = {}) => {
    let req = request(app).post('/').set('Authorization', token);
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    if (archivo) req = req.attach('file', Buffer.from('contenido'), { filename: 'demanda.pdf', contentType: 'application/pdf' });
    return req;
  };

  it('returns 201, sube el archivo a S3 bajo la carpeta del expediente y guarda su key', async () => {
    repos.expedientes.findById.mockResolvedValue(EXPEDIENTE);
    repos.documentos.create.mockResolvedValue(DOCUMENTO);

    const res = await subir(lawyerToken());

    expect(res.status).toBe(201);
    const { key } = s3.uploadBuffer.mock.calls[0][0];
    expect(key).toMatch(/^documentos\/KOOP-2026-4\/\d+-demanda\.pdf$/);
    expect(repos.documentos.create).toHaveBeenCalledWith(
      expect.objectContaining({ id_expediente: 4, id_tipo_documento: 1, nombre_archivo: 'demanda.pdf', url_storage: key, mime_type: 'application/pdf' }),
      '2'
    );
  });

  it('returns 400 when no file is attached', async () => {
    const res = await subir(adminToken(), { id_expediente: '4', id_tipo_documento: '1' }, { archivo: false });
    expect(res.status).toBe(400);
    expect(s3.uploadBuffer).not.toHaveBeenCalled();
  });

  it('returns 400 when id_expediente missing', async () => {
    const res = await subir(adminToken(), { id_tipo_documento: '1' });
    expect(res.status).toBe(400);
    expect(s3.uploadBuffer).not.toHaveBeenCalled();
  });

  it('returns 400 when id_tipo_documento missing', async () => {
    const res = await subir(adminToken(), { id_expediente: '4' });
    expect(res.status).toBe(400);
    expect(s3.uploadBuffer).not.toHaveBeenCalled();
  });

  it('returns 404 when the expediente does not exist', async () => {
    repos.expedientes.findById.mockResolvedValue(null);
    const res = await subir(adminToken());
    expect(res.status).toBe(404);
    expect(s3.uploadBuffer).not.toHaveBeenCalled();
  });

  it('returns 403 when client tries to upload', async () => {
    const { clientToken } = require('../helpers');
    const res = await subir(clientToken());
    expect(res.status).toBe(403);
    expect(s3.uploadBuffer).not.toHaveBeenCalled();
  });
});

describe('PUT /documentos/:id', () => {
  it('returns 200 on update', async () => {
    repos.documentos.update.mockResolvedValue({ ...DOCUMENTO, nombre_archivo: 'demanda_v2.pdf' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ nombre_archivo: 'demanda_v2.pdf' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.documentos.update.mockResolvedValue(null);

    const res = await request(app).put('/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /documentos/:id', () => {
  it('returns 204 y borra también el archivo en S3', async () => {
    repos.documentos.findById.mockResolvedValue({ id: 1, url_storage: 'documentos/KOOP-2026-4/1-demanda.pdf' });
    repos.documentos.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());

    expect(res.status).toBe(204);
    expect(s3.deleteObject).toHaveBeenCalledWith({ key: 'documentos/KOOP-2026-4/1-demanda.pdf' });
  });

  it('returns 404 when not found', async () => {
    repos.documentos.findById.mockResolvedValue(null);
    const res = await request(app).delete('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
    expect(s3.deleteObject).not.toHaveBeenCalled();
  });

  it('si S3 falla, el documento NO se marca como borrado (mejor uno de más que uno huérfano)', async () => {
    repos.documentos.findById.mockResolvedValue({ id: 1, url_storage: 'documentos/x/1-a.pdf' });
    s3.deleteObject.mockRejectedValue(new Error('S3 caído'));

    const res = await request(app).delete('/1').set('Authorization', adminToken());

    expect(res.status).toBe(500);
    expect(repos.documentos.softDelete).not.toHaveBeenCalled();
  });
});
