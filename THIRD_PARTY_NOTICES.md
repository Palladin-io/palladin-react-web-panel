# Third-party notices

This project uses third-party packages recorded at exact versions and integrity
hashes in `package-lock.json`. Those packages remain subject to their own
licenses; the Palladin Apache-2.0 license does not replace them.

## Direct runtime packages

The following direct runtime dependencies are MIT licensed:

`@codemirror/lang-javascript`, `@codemirror/lang-python`,
`@codemirror/language`, `@codemirror/legacy-modes`, `@codemirror/state`,
`@codemirror/view`, `@microsoft/signalr`, `@react-oauth/google`,
`@scure/bip39`, `@tanstack/react-query`, `@tanstack/react-router`,
`@uiw/react-codemirror`, `fflate`, `hash-wasm`, `i18next`, `ky`, `papaparse`,
`qrcode`, `react`, `react-dom`, `react-hook-form`, `react-i18next`, `sonner`,
`tailwindcss`, `tldts`, `zod`, and `zustand`.

The following direct runtime dependencies are Apache-2.0 licensed:

`firebase` and `jsqr`.

Additional direct runtime licenses:

| Package | License | Source |
|---|---|---|
| `libsodium-wrappers` | ISC | <https://github.com/jedisct1/libsodium.js> |
| `lucide-react` | ISC | <https://github.com/lucide-icons/lucide> |

Development-only dependencies are also pinned in `package-lock.json`; their
declared licenses are MIT, Apache-2.0, ISC, or the dual license shown above.
They are not application cryptographic providers.

## libsodium.js ISC notice

Copyright (c) 2015-2026 Ahmad Ben Mrad, Frank Denis, and Ryan Lester

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

## Bundled font

`src/assets/fonts/text-security-disc.woff2` and
`text-security-disc-compat.woff2` are distributed under the SIL Open Font
License 1.1. The full license is committed beside them as
`src/assets/fonts/text-security-LICENSE.txt`.

## Full dependency graph

Transitive package names, versions, sources, integrity hashes, and declared
licenses are available from `package-lock.json` and each installed package's
license metadata. Distributors are responsible for preserving applicable
upstream notices when repackaging the application.
