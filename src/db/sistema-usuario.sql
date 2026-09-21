-- Cuenta de servicio usada como autor de los registros de
-- consulta_externa_diaria que genera SOLA la verificacion automatica de
-- Rama Judicial (cron diario 6am y el boton "Consultar automáticos ahora").
-- consulta_externa_diaria.id_usuario es NOT NULL, asi que cada registro
-- necesita un usuario real — este deja clarísimo en la bitácora cuáles
-- revisiones las generó el sistema y cuáles un abogado real.
-- No se puede iniciar sesión con ella: el hash corresponde a un valor
-- aleatorio que nadie conoce, y ademas queda inactiva (login.js rechaza
-- cualquier cuenta con active=false).
INSERT INTO users (nombre, email, password_hash, active)
VALUES (
  'Sistema Koop (verificación automática)',
  'sistema.rama-judicial@koop.internal',
  '$2b$10$lWSLxrdkXjEk6txKAxGhr.GrTrg2mSu1MK7m8BAmdI15pWvKW0AJm',
  false
)
ON CONFLICT (email) DO NOTHING;
