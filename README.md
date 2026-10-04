# @caseflux-id/pdf-bundle

One function to convert HTML, PNG, JPEG and PDF documents into a single PDF.
Runs in the browser with Folio v0.10.1 compiled to WebAssembly using standard Go.
Input documents stay on the user's device. The first call downloads and initializes
the engine; later calls reuse it.

## npm

```sh
npm install @caseflux-id/pdf-bundle
```

```ts
import { merge } from '@caseflux-id/pdf-bundle';

const pdf = await merge([
  { mimeType: 'text/html', data: '<h1>Invoice</h1><p>Thank you.</p>' },
  { mimeType: 'image/png', data: new Uint8Array(await receipt.arrayBuffer()) },
  { mimeType: 'application/pdf', data: new Uint8Array(await terms.arrayBuffer()) },
]);

const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
const link = document.createElement('a');
link.href = url;
link.download = 'bundle.pdf';
link.click();
// Revoke the URL once the browser has finished using it.
```

All pages from each document are appended in input order. HTML accepts strings
or UTF-8 bytes; images and PDFs accept Uint8Array. Images are centered and scaled
to fit one A4 page. Existing PDF page dimensions are retained. HTML defaults to
A4 and can use CSS `@page` to control page geometry and margins.

### Per-input geometry

Every input accepts an optional `geometry`. When omitted, behavior is unchanged:
HTML uses A4 (honoring its own CSS `@page`), images are centered on one portrait
A4 page, and PDF pages keep their dimensions.

```ts
type Geometry = {
  page: "a4" | "letter" | "legal";
  orientation?: "portrait" | "landscape"; // default "portrait"
  fit?: "contain" | "cover";              // image/PDF only; default "contain"
};
```

```ts
const pdf = await merge([
  { mimeType: 'text/html', data: html, geometry: { page: 'letter', orientation: 'landscape' } },
  { mimeType: 'image/png', data: png, geometry: { page: 'a4', fit: 'cover' } },
  { mimeType: 'application/pdf', data: existing, geometry: { page: 'a4', orientation: 'portrait', fit: 'contain' } },
]);
```

- **HTML** geometry (`page`, `orientation`) is appended as a CSS
  `@page { size: <page> <orientation>; }` rule after the input's own styles, so it
  overrides a base `@page` size by source order while leaving margins and
  named/pseudo-page rules intact. `fit` is rejected for HTML.
- **Images and PDFs** support `fit`. `contain` scales the source to fit the target
  page and centers it. `cover` scales it to cover the target page and centers it,
  producing negative offsets so the parts that exceed the page fall outside the
  page box; no explicit clipping path is added, and the target page's MediaBox
  bounds what is visible, so the overflow is effectively clipped by the viewer.
  PDF relayout embeds each source page as a Form XObject, so vector content is
  preserved rather than rasterized.
- `page` is required whenever `geometry` is present. Unknown properties,
  unsupported values, or `fit` on HTML fail before engine initialization, with the
  input index in the message (for example `document 2: ...`).

## Supported CSS

`getSupportedCSS()` returns the CSS properties recognized by the bundled Folio
engine. The catalog is derived at build time from the pinned Folio
documentation, so it matches the engine without a runtime fetch or a WASM start:

```ts
import { getSupportedCSS } from '@caseflux-id/pdf-bundle';

const { folioVersion, properties, documentation } = getSupportedCSS();
const fonts = properties.filter((property) => property.category === 'Typography');
```

Each property exposes `name`, `aliases`, `values`, `category`, and `notes`. The
result is deeply frozen. `documentation` is the full upstream CSS support
document, preserving selectors, at-rules, functions, and known limitations. The
list covers registered properties only: it excludes special content, custom
properties, and at-rule descriptors, and it is not a CSS validator.

## Use jsDelivr without npm

After version 0.1.0 is published to npm:

```html
<script type="module">
  import { merge } from 'https://cdn.jsdelivr.net/npm/@caseflux-id/pdf-bundle@0.1.0/dist/index.js';
  const pdf = await merge([{ mimeType: 'text/html', data: '<h1>Hello</h1>' }]);
</script>
```

The JavaScript loader finds the matching Go runtime and WASM next to itself.
Use the direct, pinned `dist/index.js` URL; this package does not rely on
jsDelivr's `+esm` transformations. CDN URLs do not exist until publication.

## Rsbuild: npm in development, CDN in production

Keep the same import in application code:

```ts
import { merge } from '@caseflux-id/pdf-bundle';
```

Configure an exact alias in `rsbuild.config.ts`:

```ts
import { defineConfig } from '@rsbuild/core';

export default defineConfig(({ env }) => ({
  resolve: {
    alias: env === 'production'
      ? { '@caseflux-id/pdf-bundle$': '@caseflux-id/pdf-bundle/cdn' }
      : {},
  },
}));
```

The local entry uses `new URL('./engine.wasm', import.meta.url)`, allowing the
bundler to emit the packaged asset. The CDN entry bundles the small loader and
fetches the runtime and WASM from the exact same package version on jsDelivr.
It contains no local WASM reference, so the production bundler need not emit an
unused engine. Applications can also import `@caseflux-id/pdf-bundle/cdn`
directly when they want CDN loading in every environment.

## HTML and PDF behavior

- HTML rendering uses Folio's supported HTML/CSS subset, not a browser print
  engine. JavaScript in HTML is not executed.
- Embed assets using data URIs, including images and `@font-face` fonts.
  Browser builds cannot fetch remote HTML assets or read local file paths.
  Asset failures reject the call instead of silently omitting content.
- Non-Latin text may require an embedded font with the appropriate glyphs.
- Merging copies PDF pages. Document-level structures such as bookmarks,
  interactive form catalogs, attachments and signature validity are not
  guaranteed to survive. Password-protected PDFs are outside this API's scope.
- Conversion currently runs on the calling thread. For large documents,
  call the API inside a Web Worker to keep the interface responsive.
- npm packaging works with browser bundlers. This is a browser API; direct
  Node.js file loading is not supported by the default loader.

## Build and test

Requires Go 1.27.1 and Node.js 24. No npm dependencies are required.

```sh
go mod download
npm run test:go
npm run build
npm test
npm run test:wasm
npm pack
```

Builds use `-trimpath -ldflags='-s -w'`. The matching `wasm_exec.js` is copied
from the Go compiler installation, with a named ESM export added. All linked
module licenses and the Go license are included in the npm package.
Generated files are excluded from git and rebuilt by CI.

### Measured build size

For version 0.1.0 built with Go 1.27.1:

| Artifact | Bytes |
| --- | ---: |
| WASM, uncompressed | 14,079,785 |
| WASM, gzip level 9 | 3,718,743 |

The compressed figure is a local measurement, not a guarantee of the CDN's
chosen content encoding. A narrow public API does not necessarily make the
engine small: HTML rendering plus PDF reading/merging still reaches substantial
code. TinyGo compatibility and size have not been tested.

Verification completed: Go conversion/merge tests, four JavaScript loader
tests, and an end-to-end test executing the compiled WASM through the wrapper
with all four input MIME types. The Rsbuild alias follows its documented exact
matching syntax; a complete Rsbuild application build has not been tested here.

## Publish

1. Create a public `caseflux-id/pdf-bundle` GitHub repository and push this source.
2. Ensure your npm account can publish to the `@caseflux-id` scope.
3. Create a narrowly scoped npm granular access token with publish access and
   the bypass-2FA setting, and add it
   as the repository's `NPM_TOKEN` Actions secret. Never commit the token.
4. Set the desired version in `package.json`, commit it, and push a matching
   tag such as `v0.1.0`.

The publish workflow builds and tests the package before publishing publicly
with provenance. GitHub and npm organizations are separate accounts. The
workflow can later use npm trusted publishing once configured on npm.

## License

Apache-2.0. Built on [Folio](https://github.com/carlos7ags/folio).
See NOTICE and the generated THIRD_PARTY_LICENSES directory for attribution.
