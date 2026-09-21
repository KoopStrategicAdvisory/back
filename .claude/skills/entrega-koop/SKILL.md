---
name: entrega-koop
description: Definición de "terminado" para KOOP. Úsalo SIEMPRE que se implemente, cambie o corrija algo en la aplicación (funcionalidad nueva, corrección de un error, flujo, pantalla, endpoint, regla de negocio) en el backend o en el front. Obliga a entregar el cambio junto con sus pruebas (backend y navegador), el reporte de pruebas y la actualización del manual de usuario.
---

# Entrega completa en KOOP

En KOOP **ningún cambio está terminado hasta que trae tres cosas**: sus pruebas, el reporte de pruebas y el manual de usuario al día. No son un paso opcional "para después": van en el mismo trabajo y en el mismo commit.

Los dos repositorios (están uno al lado del otro):

| Repo | Ruta | Qué hay |
|---|---|---|
| **back** | `C:\Workspace\koop\back` | API Node/Express + Postgres. Pruebas Jest. Scripts de verificación. |
| **front** | `C:\Workspace\koop\v2\front` (app en `apps/koop`) | React + Vite. Pruebas de navegador (Playwright) y manual de usuario. |

## El flujo (síguelo en orden)

### 1. Entiende y define el alcance
Antes de programar, identifica qué **cambia para el usuario**: ¿hay pantalla, botón, mensaje, regla o flujo nuevo o distinto? Eso decide qué pruebas y qué parte del manual tocas (paso 5).

### 2. Programa el cambio (sin adornos)
Lo mínimo que resuelva el problema. No cambies lo que no te pidieron.

### 3. Pruebas del backend — SIEMPRE que toques el backend
Elige la capa correcta (plantillas en [plantillas.md](plantillas.md)):

| Si cambias… | Prueba en… |
|---|---|
| Validación, permisos o respuesta de un endpoint | `__tests__/features/<area>.test.js` (unitaria, repositorios simulados) |
| Una consulta SQL, un repositorio o una regla que depende de la base | `__tests__/integration/*.integration.test.js` (Postgres en memoria real, PGlite) |
| Un flujo de varios pasos entre endpoints | `__tests__/functional/*.functional.test.js` |
| Seguridad (quién puede ver/hacer qué) | Siempre una prueba explícita del caso **prohibido** además del permitido |

Reglas:
- Cada error corregido lleva una **prueba de regresión que FALLA sin el arreglo**. Compruébalo: quita el arreglo un momento (o usa `git stash`) y confirma que la prueba se pone roja.
- Prueba el camino feliz **y** los bordes: dato faltante, rol sin permiso, registro inexistente, día pasado, etc.
- Los roles reales son `admin`, `super_admin`, `abogado`, `socio`, `asociado`, `junior`, `paralegal`, `secretario`, `contador`, `cliente`, `emprendedor` (nunca `lawyer`/`client` en tokens de prueba).
- S3, correo y la Rama Judicial **se simulan siempre**; una prueba jamás toca servicios reales.

### 4. Prueba de navegador (E2E) — SIEMPRE que cambie algo que el usuario ve o hace
En el front: `apps/koop/e2e/NN-nombre.spec.js` (siguiente número libre). Usa los helpers de `e2e/helpers/` (`iniciarSesion`, `crearClienteConExpediente`, `agregarASeguimiento`, `enlaceDelCorreo`…) y los usuarios de `e2e/fixtures/users.js`.
- Cada prueba **crea sus propios datos** (por API) y no depende de otras.
- Verifica lo que ve el usuario (textos, botones, avisos), no detalles internos.
- Un error corregido en pantalla lleva su E2E de regresión.
- Las pruebas corren contra una **instancia aislada** (backend :4100, base `koop_e2e`, S3/correo/Rama simulados). Nunca contra la base real. Necesita **Docker abierto**.

### 5. Manual de usuario — SIEMPRE que cambie lo que el usuario ve, hace o entiende
Es el paso que más se olvida. Si el cambio es visible, actualiza **las tres piezas** (ver [plantillas.md](plantillas.md)):
1. `apps/koop/docs/manual/manual-de-usuario.md`: el texto, en el capítulo que corresponda, con el mismo tono didáctico (pasos numerados, tablas "N.º / Qué es", recuadros **Consejo / Ojo / Importante**), y sin emojis salvo los que ya tenga la pantalla.
2. `apps/koop/manual/manual.spec.js`: un paso que recorra la pantalla con datos de ejemplo y saque la captura (`captura(page, 'NN-nombre', { resaltar: [...] })`). Si añades captura, referencia `img/NN-nombre.jpg` en el texto.
3. Regenera: `pnpm manual` (desde `apps/koop`) → actualiza capturas y `Manual-de-Usuario-KOOP.pdf`.
Si el cambio **no** es visible (refactor interno, índice SQL…), no toques el manual — pero dilo explícitamente en el resumen.

### 6. Verifica todo y genera el reporte
Desde `C:\Workspace\koop\back` (Docker abierto):

```bash
npm run verificar                  # unitarias + funcionales + E2E → reports/reporte-de-pruebas.html
npm run verificar -- --con-manual  # además regenera el manual de usuario
npm run verificar -- --sin-e2e     # solo backend (iteraciones rápidas)
```
- Debe terminar en **TODO EN VERDE** (código de salida 0). Si algo falla: arréglalo, no lo silencies ni lo borres.
- Si el reporte dice **AVISO** de que el manual quedó atrás, atiéndelo (paso 5).
- Antes de cerrar el trabajo corre la verificación **completa** al menos una vez.
- Si Postgres no responde (`ECONNREFUSED`), abre Docker Desktop y espera al contenedor `postgres-db`.

### 7. Documenta y entrega
- Si cambió un flujo del backend, actualiza su sección del `README.md` del back (diagramas Mermaid incluidos).
- **Commits** (los valida commitlint; si falla, no pasa nada: corrige el mensaje y repite):
  - título en minúscula, ≤ 72 caracteres, formato `tipo: descripción` (`feat`, `fix`, `test`, `docs`, `chore`);
  - líneas del cuerpo ≤ 100 caracteres.
- **Agrega los archivos por nombre**, nunca `git add -A` ni `git add .` (hay archivos sueltos del usuario que no se deben subir).
- Sube **ambos repos** si tocaste ambos (`git push`). En el back, GitHub Actions corre `npm run test:all` en cada push.
- Si el backend cambió, avisa al usuario que **reinicie su backend** (el servidor de desarrollo no recarga solo).

### 8. Cierra con el resumen de entrega
Termina siempre diciendo, en pocas líneas y en lenguaje simple:
- qué cambió para el usuario;
- la tabla del reporte (pega `reports/reporte-de-pruebas.md`): pruebas por capa y veredicto;
- qué pruebas nuevas se agregaron;
- si se actualizó el manual (y qué capítulo) o por qué no hacía falta.

## Reglas que no se negocian
- **Nunca** correr pruebas ni scripts contra la base de datos real de la firma ni contra S3 real. Los datos reales del usuario no se tocan para "probar".
- Nada de credenciales ni datos reales de clientes en pruebas, capturas o manual: solo datos de ejemplo inventados.
- No marcar como terminado con pruebas rojas, omitidas a propósito o "flaky" sin explicación.
- Si dudas si un cambio es visible para el usuario, **asume que sí** y actualiza el manual.
