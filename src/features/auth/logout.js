'use strict';
const { clearRefreshCookie } = require('./_helpers');

async function handler(req, res, next) {
  try {
    clearRefreshCookie(res);
    return res.status(200).json({ message: 'Logout correcto.' });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/logout', middleware: [], handler };
