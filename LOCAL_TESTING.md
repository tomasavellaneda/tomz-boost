# Pruebas locales (antes de producción)

Copia de trabajo para testear la **app Electron** en tu PC sin tocar Railway ni el flujo de producción.

## En tu PC (Windows recomendado)

```bash
git clone https://github.com/tomasavellaneda/tomz-boost.git
cd tomz-boost
git checkout -b local-dev
npm install
```

### Correr la app

```bash
npm run typecheck
npm run dev
```

### Build de prueba (instalador, sin publicarlo)

```bash
npm run dist
```

El `.exe` queda en `dist/` / `release/` (carpeta ignorada por git).

## Bot Discord

El bot de **producción** vive en Railway. No lo corras en local contra el mismo server si no querés choques.

Si necesitás un bot de prueba:

1. Creá otra app/bot en Discord Developer Portal (o otro server de test).
2. Copiá `.env.example` → `.env` con tokens de **test**.
3. `npm run bot`

## Qué no subir a producción

- No pongas secrets reales en el repo.
- No hagas `git push` a `main` hasta validar en `local-dev`.
- Railway no se actualiza solo con este repo de la app; el bot desplegado es un servicio aparte.

## Flujo sugerido

1. Cambios en `local-dev`
2. Probar con `npm run dev`
3. Si está ok → merge a `main` / release
