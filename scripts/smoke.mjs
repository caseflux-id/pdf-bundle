// End-to-end test of the compiled engine and the published ESM wrapper.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
globalThis.crypto ??= webcrypto;
const wasm = await readFile("dist/engine.wasm");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, ...args) => {
  if (new URL(url).protocol === "file:") return new Response(wasm, { headers: { "Content-Type": "application/wasm" } });
  return originalFetch(url, ...args);
};
const { merge } = await import("../dist/index.js");
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
console.log(`WASM smoke passed: ${first.byteLength} bytes, merged ${result.byteLength} bytes`);
globalThis.fetch = originalFetch;
