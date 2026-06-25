# Development Setup

Last updated: 2026-06-25

## Project Layout

- `web/`: Fumadocs + Next.js web application.
- `docs/`: project planning and development notes.

## Package Registry

The project uses npmmirror for faster package installation in China:

```text
registry=https://registry.npmmirror.com/
fund=false
audit=false
```

This is configured in both root `.npmrc` and `web/.npmrc`.

## Commands

Run commands from `web/`:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run types:check
```

## Next.js SWC Native Notes

Current local environment:

- Node.js: `v22.22.3`
- Next.js: `16.2.9`
- Fumadocs UI/Core: `16.10.5`
- Platform: Linux x64 under WSL2

The generated Fumadocs project uses Next.js 16, which normally loads `@next/swc-linux-x64-gnu`.

During initial setup, the native SWC binary was left truncated after an interrupted install. The broken file was about 42 MB, while the expected unpacked binary is about 130 MB. Symptoms included:

```bash
node -e "require('@next/swc-linux-x64-gnu')"
# Bus error
```

The fix was to reinstall the package:

```bash
npm install --force --no-save @next/swc-linux-x64-gnu@16.2.9
```

After reinstalling, native SWC loads correctly under Node.js 22:

```bash
node -e "require('@next/swc-linux-x64-gnu'); console.log('native swc loaded')"
```

Default scripts now use native SWC and Next.js defaults:

```json
{
  "dev": "NEXT_TELEMETRY_DISABLED=1 next dev",
  "build": "NEXT_TELEMETRY_DISABLED=1 next build",
  "types:check": "fumadocs-mdx && NEXT_TELEMETRY_DISABLED=1 next typegen && tsc --noEmit"
}
```

WASM/Webpack fallback scripts are kept in case native SWC breaks again:

```bash
npm run dev:wasm
npm run build:wasm
npm run types:check:wasm
```

## Verification Status

Verified successfully:

```bash
npm run lint
npm run types:check
npm run build
```
