# KOOP — backend (guía para quien trabaje en este proyecto)

Plataforma de gestión jurídica de Koop Strategic Advisory. Este repo es la API (Node + Express + Postgres). El front vive al lado: `C:\Workspace\koop\v2\front` (app en `apps/koop`). Quien lo usa **no es técnico**: explica en lenguaje simple.

## Regla de oro: nada está terminado sin pruebas, reporte y manual

Toda funcionalidad nueva, corrección de error o cambio de flujo se entrega **completa por defecto**, sin que nadie tenga que pedirlo:

1. **Pruebas del backend** (unitaria / integración / funcional) — y una **prueba de regresión** si es un error.
2. **Prueba E2E de navegador** (Playwright, en el front) si cambia algo que el usuario ve o hace.
3. **Manual de usuario actualizado** (texto + captura + `pnpm manual`) si el cambio es visible; si no lo es, decirlo.
4. **Reporte de pruebas**: `npm run verificar` debe terminar en **TODO EN VERDE**, y el resumen final pega la tabla de `reports/reporte-de-pruebas.md`.

El procedimiento completo, con plantillas listas para copiar, está en el skill **`entrega-koop`** (`.claude/skills/entrega-koop/`). Léelo y síguelo cada vez que implementes algo.

## Comandos

| Qué | Comando (desde `C:\Workspace\koop\back`) |
|---|---|
| Todo + reporte (necesita Docker abierto) | `npm run verificar` |
| Todo + regenerar el manual | `npm run verificar -- --con-manual` |
| Solo backend, rápido | `npm run verificar -- --sin-e2e` · o `npm run test:all` |
| Solo unitarias | `npm test` |
| Solo funcionales/integración | `npm run test:functional` |
| E2E (desde `v2/front/apps/koop`) | `pnpm test:e2e` |
| Manual de usuario (desde `v2/front/apps/koop`) | `pnpm manual` |

El reporte queda en `reports/reporte-de-pruebas.html` (+ `.md`); esa carpeta no se sube a git.

## Cosas que hay que saber

- **Nunca** ejecutar pruebas o scripts contra la base real (`root`, puerto 5432) ni contra S3 real. Las pruebas usan Postgres en memoria (Jest) o la base aislada `koop_e2e` (Playwright, backend en :4100, S3/correo/Rama Judicial simulados en `scripts/e2e-server.cjs`).
- Para el E2E y el manual hace falta **Docker Desktop abierto** (contenedor `postgres-db`). Si sale `ECONNREFUSED 127.0.0.1:5432`, es eso.
- El servidor de desarrollo del usuario **no recarga solo**: tras cambiar el backend, avísale que lo reinicie.
- Roles reales: `admin`, `super_admin`, `abogado`, `socio`, `asociado`, `junior`, `paralegal`, `secretario`, `contador`, `cliente`, `emprendedor`.
- Commits (los valida commitlint): título en minúscula, ≤ 72 caracteres, `tipo: descripción`; líneas del cuerpo ≤ 100. **Agrega archivos por nombre**, nunca `git add -A`/`.` (hay archivos sueltos del usuario: `scripts/_fix_seed_booleans.mjs`, `src/db/*.sqlbook`, `src/db/data.sql.txt`).
- CI: GitHub Actions corre `npm run test:all` en cada push y pull request.
- Los flujos de negocio están documentados (con diagramas) en `README.md`; si cambias uno, actualiza su sección.

## Estructura de pruebas

```
__tests__/features/      unitarias (endpoints con repositorios simulados)
__tests__/integration/   *.integration.test.js  → Postgres real en memoria (PGlite)
__tests__/functional/    flujos de varios pasos (PGlite)
scripts/e2e-server.cjs   servidor aislado para Playwright y para el manual
scripts/reporte-pruebas.cjs   orquestador del reporte (npm run verificar)
```
