# Tomz Boost

Utilidad de sistema y optimización para Windows (monitoreo real + tweaks reales). App de escritorio con Electron + React + TypeScript.

## Requisitos

- Node.js 20+ (recomendado)
- Windows para correr la app y los tweaks de sistema
- (Opcional) Discord bot / pagos: copiá `.env.example` a `.env` y completá las claves

## Setup

```bash
npm install
cp .env.example .env   # solo si usás el bot de Discord / pagos
```

## Desarrollo

```bash
npm run dev
```

## Build (instalador Windows)

```bash
npm run dist
```

## Scripts útiles

| Comando | Descripción |
| --- | --- |
| `npm run typecheck` | Chequeo TypeScript |
| `npm run bot` | Bot de Discord para keys |
| `npm run key:new` | Generar una license key |
| `npm run test:mp-qr-png` | Smoke test de generación de QR PNG |
| `npm test:nvidia-profile-migration` | Test de migración de perfil NVIDIA |

## Bot en Railway

El servicio debe correr solo el bot Discord (no Electron).

1. En Railway → tu servicio → **Variables**, agregá (sin espacios):

```
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_ADMIN_IDS=...
DISCORD_CLIENT_ID=1548162530260684810
MP_AR_ACCESS_TOKEN=...
MP_AR_QR=checkout
PRICE_ARS=20000
PRICE_CUSTOM_ARS=50000
```

2. **Settings → Deploy → Custom Start Command** (si no usa `railway.toml`):
   `node scripts/discord-key-bot.cjs`

3. Redeploy. En los logs deberías ver `Bot listo:` y `Pagos app: ar:on`.

Este repo incluye `railway.toml` con ese start command.
El `.env` local **no** viaja a Railway: las vars van en el panel.

## Pagos Mercado Pago (Argentina)

Por defecto usa la **integracion Checkout Pro** (`POST /checkout/preferences`):
link de pago + QR del checkout. Solo hace falta `MP_AR_ACCESS_TOKEN` de
[Tus integraciones](https://www.mercadopago.com.ar/developers).

Opcional: `MP_AR_QR=native` usa Codigo QR presencial (Orders + caja).

Brasil sigue con Pix nativo (`MP_BR_ACCESS_TOKEN`).
