'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { users } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const { active = 'true', limit = '50', offset = '0' } = req.query;
    const rows = await users.findAll({ active: active !== 'false', limit: Number(limit), offset: Number(offset) });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate, requireRoles('admin')], handler };
