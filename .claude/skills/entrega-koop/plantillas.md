# Plantillas para entregar un cambio en KOOP

Copia, pega y adapta. Todas están sacadas de pruebas que ya existen y funcionan en el proyecto.

## 1. Prueba unitaria de un endpoint (back)

Archivo: `back/__tests__/features/<area>.test.js`. Repositorios simulados; `resetMocks` está activo, así que **fija las respuestas dentro de cada prueba**.

```js
'use strict';
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  expedientes: { findById: jest.fn() },
  tareas: { create: jest.fn() },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken, clientToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/tareas'));

describe('POST /tareas', () => {
  it('returns 201 cuando un abogado la crea', async () => {
    repos.tareas.create.mockResolvedValue({ id: 1 });
    const res = await request(app).post('/').set('Authorization', lawyerToken())
      .send({ titulo: 'Revisar', id_expediente: 5, id_estado_tarea: 1 });
    expect(res.status).toBe(201);
  });

  it('returns 400 cuando falta un dato obligatorio', async () => {
    const res = await request(app).post('/').set('Authorization', adminToken()).send({ titulo: 'x' });
    expect(res.status).toBe(400);
    expect(repos.tareas.create).not.toHaveBeenCalled();
  });

  it('returns 403 cuando un cliente intenta crearla (caso prohibido)', async () => {
    const res = await request(app).post('/').set('Authorization', clientToken()).send({});
    expect(res.status).toBe(403);
  });
});
```

## 2. Prueba de integración con base real en memoria (back)

Archivo: `back/__tests__/integration/<tema>.integration.test.js` (el sufijo `.integration.test.js` es obligatorio: así lo recoge `npm run test:functional`). Modelo completo: `consultas-api.integration.test.js`.

```js
'use strict';
const fs = require('fs');
const path = require('path');
jest.mock('../../src/db/client', () => ({ getDb: jest.fn(), withUser: jest.fn() }));
const client = require('../../src/db/client');
let db;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.waitReady;
  await db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  // si tu cambio usa una migración propia: await db.exec(fs.readFileSync('.../mi-migracion.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  client.getDb.mockResolvedValue(db);
  client.withUser.mockImplementation((id, fn) => db.transaction(fn));
  // Ojo: TRUNCATE ... CASCADE de `clientes` también vacía `users` (users.id_cliente).
});
```
Para servicios externos: `jest.mock('../../src/services/s3', () => ({ uploadBuffer: jest.fn(), ... }))`.

## 3. Prueba de navegador (front)

Archivo: `front/apps/koop/e2e/NN-nombre.spec.js`. Una prueba = un comportamiento, con datos propios.

```js
import { test, expect } from '@playwright/test';
import { ADMIN } from './fixtures/users.js';
import { iniciarSesion } from './helpers/auth.js';
import { tokenDe, crearClienteConExpediente } from './helpers/api.js';

test.describe('Mi funcionalidad', () => {
  test('el usuario hace X y ve Y', async ({ page, request }) => {
    const token = await tokenDe(request, ADMIN);
    const { expediente } = await crearClienteConExpediente(request, token, {
      nombre: 'Cliente E2E Mi Funcion', expediente: 'E2E-50', radicado: '11001400305020260005000',
    });

    await iniciarSesion(page, ADMIN);          // espera a llegar al dashboard
    await page.goto(`/admin/expedientes/${expediente.id}`);
    await page.getByRole('button', { name: 'Mi botón' }).click();

    await expect(page.getByText('Mensaje de éxito')).toBeVisible();
  });
});
```
Trucos que ya nos costaron tiempo:
- Siempre `await iniciarSesion(...)` (no `loginPorUI`) antes de navegar a otra ruta.
- Si un texto aparece en varios sitios, usa `{ exact: true }` o acota con `page.locator('article', { hasText: ... })`.
- Si el primer resultado de un selector puede estar oculto (menús cerrados), filtra con `.filter({ visible: true })`.
- Las barras invertidas de una regex se pierden al escribir archivos desde `sed`/`node -e`: usa el editor de archivos.
- Correos: el servidor de pruebas tiene un buzón falso; `enlaceDelCorreo(request, 'correo@x.test')` devuelve el enlace.
- Rama Judicial y S3 están simulados en `back/scripts/e2e-server.cjs`. Si tu cambio necesita otra respuesta simulada, se agrega ahí.

## 4. Actualizar el manual de usuario

### 4.a Texto — `front/apps/koop/docs/manual/manual-de-usuario.md`
Patrón de una sección (copia el estilo de las existentes):

```md
### 5.9 Mi funcionalidad nueva

1. Abre el menú → **Consultas**.
2. Pulsa **Mi botón** (1) y llena el campo (2).

![Pantalla de mi funcionalidad](img/44-mi-funcionalidad.jpg)

| N.º | Qué es |
|---|---|
| 1 | El botón que abre el formulario. |
| 2 | El dato obligatorio. |

> **Consejo:** algo útil que ahorra tiempo.

> **Ojo:** algo que puede salir mal, y qué hacer.

> **Importante:** una regla que no se puede saltar.
```
Tipos de recuadro: `Consejo`, `Ojo`, `Importante`, `Ejemplo`, `Recuerda`. Numeración de la imagen = orden del arreglo `resaltar`.
Actualiza también la sección de **Preguntas frecuentes** (capítulo 9) si el cambio evita o crea un problema típico, y el **Glosario** (capítulo 10) si aparece un término nuevo.

### 4.b Captura — `front/apps/koop/manual/manual.spec.js`
Los pasos corren **en orden** y comparten los datos de `manual/helpers/datos.js` (variable `d`). Agrega tu paso en el capítulo que corresponda:

```js
test('mi funcionalidad', async ({ page }) => {
  await page.goto('/mi-ruta');
  await expect(page.getByText('Algo visible')).toBeVisible();
  await captura(page, '44-mi-funcionalidad', {
    resaltar: [page.getByRole('button', { name: 'Mi botón' }), page.getByLabel('Mi campo')],
    // enfocar: tarjeta,   // centra un elemento lejano antes de marcar
  });
});
```
Si necesitas datos de ejemplo nuevos, agrégalos (inventados) en `manual/helpers/datos.js`.

### 4.c Regenerar
```bash
cd C:\Workspace\koop\v2\front\apps\koop
pnpm manual          # capturas + PDF   (o: pnpm manual:capturas / pnpm manual:build)
```
Revisa 2-3 imágenes nuevas (¿los recuadros caen donde dice el texto?) y confirma que `docs/manual/Manual-de-Usuario-KOOP.pdf` cambió. Se versionan el `.md`, las imágenes `.jpg` y el `.pdf` (el `.html` no).

## 5. Lista de chequeo (pégala en tu resumen)

```
[ ] Pruebas de backend (capa correcta) — incluida regresión si era un error
[ ] Prueba E2E si cambia algo visible
[ ] Manual: texto + captura + `pnpm manual`   (o justificación de por qué no aplica)
[ ] `npm run verificar` → TODO EN VERDE (reporte adjunto)
[ ] README del back si cambió un flujo
[ ] Commits con formato (minúscula, ≤72) y archivos agregados por nombre
[ ] Push de los repos tocados
[ ] Aviso de reiniciar el backend si aplica
```
