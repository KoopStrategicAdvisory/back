'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const AppError  = require('../../errors/AppError');

function makeCatalogSlices(repo, { writeRoles = ['admin'] } = {}) {
  const writeMiddleware = [authenticate, requireRoles(...writeRoles)];

  const list = {
    method: 'GET', path: '/',
    middleware: [authenticate],
    handler: async (req, res, next) => {
      try {
        const active = req.query.active !== 'false';
        const rows = await repo.findAll({ active });
        res.json(rows);
      } catch (err) { next(err); }
    },
  };

  const get = {
    method: 'GET', path: '/:id',
    middleware: [authenticate],
    handler: async (req, res, next) => {
      try {
        const row = await repo.findById(Number(req.params.id));
        if (!row) throw new AppError(404, 'No encontrado.');
        res.json(row);
      } catch (err) { next(err); }
    },
  };

  const create = {
    method: 'POST', path: '/',
    middleware: [...writeMiddleware],
    handler: async (req, res, next) => {
      try {
        const row = await repo.create(req.body, req.user.sub);
        res.status(201).json(row);
      } catch (err) { next(err); }
    },
  };

  const update = {
    method: 'PUT', path: '/:id',
    middleware: [...writeMiddleware],
    handler: async (req, res, next) => {
      try {
        const row = await repo.update(Number(req.params.id), req.body, req.user.sub);
        if (!row) throw new AppError(404, 'No encontrado.');
        res.json(row);
      } catch (err) { next(err); }
    },
  };

  const remove = {
    method: 'DELETE', path: '/:id',
    middleware: [...writeMiddleware],
    handler: async (req, res, next) => {
      try {
        const row = await repo.softDelete(Number(req.params.id), req.user.sub);
        if (!row) throw new AppError(404, 'No encontrado.');
        res.status(204).send();
      } catch (err) { next(err); }
    },
  };

  return [list, get, create, update, remove];
}

module.exports = { makeCatalogSlices };
