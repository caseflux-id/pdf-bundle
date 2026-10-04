// End-to-end test of the compiled engine and the published ESM wrapper.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
globalThis.crypto ??= webcrypto;
const wasm = await readFile("dist/engine.wasm");
const originalFetch = globalThis.fetch;
let fetches = 0;
globalThis.fetch = async (url, ...args) => {
  fetches++;
  if (new URL(url).protocol === "file:") return new Response(wasm, { headers: { "Content-Type": "application/wasm" } });
  return originalFetch(url, ...args);
};
const { merge, getSupportedCSS } = await import("../dist/index.js");
assert.equal(fetches, 0, "importing the entry point must not fetch or start WASM");
const css = getSupportedCSS();
assert.equal(css.folioVersion, "v0.10.1");
assert.equal(css.properties.length, 139);
assert.ok(Object.isFrozen(css));
assert.ok(Object.isFrozen(css.properties));
assert.ok(css.properties.every((p) => Object.isFrozen(p) && Object.isFrozen(p.aliases) && Object.isFrozen(p.values)));
assert.match(css.documentation, /^# Folio CSS support\n/);
const counts = new Map();
for (const property of css.properties) counts.set(property.category, (counts.get(property.category) ?? 0) + 1);
assert.equal(counts.get("Typography"), 23);
assert.equal(counts.get("Color"), 1);
assert.equal(counts.get("PDF"), 6);
assert.equal(fetches, 0, "getSupportedCSS must not fetch or start WASM");
const cdn = await import("../dist/cdn.js");
assert.equal(cdn.getSupportedCSS().properties.length, 139);
assert.equal(fetches, 0, "the CDN entry point's getSupportedCSS must not fetch or start WASM");
const first = await merge([{ mimeType: "text/html", data: "<h1>First document</h1>" }]);
assert.equal(new TextDecoder().decode(first.subarray(0, 5)), "%PDF-");
const result = await merge([
  { mimeType: "application/pdf", data: first },
  { mimeType: 'image/png', data: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAE0lEQVR4nGP8z8DAwMDAxIBMAQAUQAEF3SN5DgAAAABJRU5ErkJggg==', "base64")) },
  { mimeType: 'image/jpeg', data: Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z', "base64")) },
  { mimeType: "text/html", data: "<p>Second document</p>" },
]);
const output = new TextDecoder("latin1").decode(result);
assert.match(output, /\/Count 4\b/);
await assert.rejects(merge([{ mimeType: "application/pdf", data: new Uint8Array([1, 2]) }]), /document 0/);
const geometry = await merge([
  { mimeType: "text/html", data: "<p>Landscape</p>", geometry: { page: "letter", orientation: "landscape" } },
  { mimeType: "image/png", data: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAE0lEQVR4nGP8z8DAwMDAxIBMAQAUQAEF3SN5DgAAAABJRU5ErkJggg==', "base64")), geometry: { page: "a4", fit: "cover" } },
  { mimeType: "application/pdf", data: first, geometry: { page: "a4", orientation: "portrait", fit: "contain" } },
]);
const geometryOutput = new TextDecoder("latin1").decode(geometry);
assert.match(geometryOutput, /\/Count 3\b/);
assert.match(geometryOutput, /\/MediaBox \[0 0 792(\.0)? 612(\.0)?\]/);
console.log(`WASM smoke passed: ${first.byteLength} bytes, merged ${result.byteLength} bytes, geometry ${geometry.byteLength} bytes`);
globalThis.fetch = originalFetch;
