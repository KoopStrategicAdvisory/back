'use strict';
const AppError = require('../errors/AppError');

module.exports = (err, req, res, next) => {
  if (err instanceof AppError)
    return res.status(err.status).json({ message: err.message });

  if (err.code === '23505')
    return res.status(409).json({ message: 'El registro ya existe.' });

  if (err.code === '23503')
    return res.status(409).json({ message: 'Referencia a registro inexistente.' });

  console.error(err);
  res.status(500).json({ message: 'Error interno del servidor.' });
};
