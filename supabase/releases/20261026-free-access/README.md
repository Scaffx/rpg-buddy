# Edge free-access release candidate (local only)

`manifest.json` records the downloaded LIVE versions, `verify_jwt` metadata, SHA-256 hashes, exact bases and final working files. The `*.live.ts` files are byte-for-byte archives of the downloaded LIVE sources. The `*.head.ts` files are byte-for-byte Git HEAD sources where preserving the current app contract takes precedence over reproducing an older LIVE defect. The `*.patched.ts` files are release candidates identical to the three `supabase/functions/*/index.ts` files.

Run `node supabase/releases/20261026-free-access/verify-release.mjs` at the repository root. It checks raw hashes, byte equality with the working sources, expected selective changes, absence of payment gates and direct XP/gold paths. It does not inspect a remote deployment. The companion handoff is `docs/entregas/20261026-edge-free-release.md`.
