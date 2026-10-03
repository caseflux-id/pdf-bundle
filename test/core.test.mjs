import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createMerge, normalize } from "../src/core.js";

test("accepts UTF-8 HTML and byte views without including unrelated bytes", () => {
  const bytes = new Uint8Array([99, 1, 2, 99]);
  const result = normalize([
    { mimeType: "text/html", data: "<p>Hello 世界</p>" },
    { mimeType: "application/pdf", data: bytes.subarray(1, 3) },
  ]);
  assert.equal(new TextDecoder().decode(result[0].data), "<p>Hello 世界</p>");
  assert.deepEqual([...result[1].data], [1, 2]);
});

test("normalizes geometry with portrait and contain defaults", () => {
  const result = normalize([
    { mimeType: "text/html", data: "<p>x</p>", geometry: { page: "letter", orientation: "landscape" } },
    { mimeType: "image/png", data: new Uint8Array([1]) },
    { mimeType: "image/jpeg", data: new Uint8Array([1]), geometry: { page: "legal", fit: "cover" } },
    { mimeType: "application/pdf", data: new Uint8Array([1]), geometry: { page: "a4" } },
  ]);
  assert.deepEqual(result[0].geometry, { page: "letter", orientation: "landscape" });
  assert.equal(result[1].geometry, undefined);
  assert.deepEqual(result[2].geometry, { page: "legal", orientation: "portrait", fit: "cover" });
  assert.deepEqual(result[3].geometry, { page: "a4", orientation: "portrait", fit: "contain" });
});

test("rejects invalid geometry and fit on HTML", () => {
  const cases = [
    [{ mimeType: "image/png", data: new Uint8Array([1]), geometry: {} }],
    [{ mimeType: "image/png", data: new Uint8Array([1]), geometry: { page: "tabloid" } }],
    [{ mimeType: "image/png", data: new Uint8Array([1]), geometry: { page: "a4", orientation: "sideways" } }],
    [{ mimeType: "image/png", data: new Uint8Array([1]), geometry: { page: "a4", fit: "fill" } }],
    [{ mimeType: "image/png", data: new Uint8Array([1]), geometry: { page: "a4", margin: 1 } }],
    [{ mimeType: "image/png", data: new Uint8Array([1]), geometry: null }],
    [{ mimeType: "text/html", data: "<p>x</p>", geometry: { page: "a4", fit: "contain" } }],
  ];
  for (const value of cases) {
    assert.throws(() => normalize(value), /document 0/);
  }
});

test("rejects empty, unsupported, and mistyped documents", async () => {
  for (const value of [[], null, [{ mimeType: "image/webp", data: new Uint8Array([1]) }],
    [{ mimeType: "application/pdf", data: "not bytes" }],
    [{ mimeType: "image/png", data: new Uint8Array() }]]) {
    assert.throws(() => normalize(value), TypeError);
  }
  let requested = false;
  await assert.rejects(createMerge(() => { requested = true; }, "unused")([]), TypeError);
  assert.equal(requested, false);
});

const originalFetch = globalThis.fetch;
const originalInstantiate = WebAssembly.instantiate;
const originalStreaming = WebAssembly.instantiateStreaming;
const key = Symbol.for("@caseflux-id/pdf-bundle@__VERSION__");
const bridge = "__caseflux_pdf_bundle___VERSION__";
afterEach(() => {
  globalThis.fetch = originalFetch;
  WebAssembly.instantiate = originalInstantiate;
  WebAssembly.instantiateStreaming = originalStreaming;
  delete globalThis[key];
  delete globalThis[bridge];
});

test("shares initialization and falls back when streaming fails", async () => {
  let requests = 0, starts = 0;
  globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([0]), { status: 200 }); };
  WebAssembly.instantiateStreaming = async () => { throw new TypeError("bad MIME"); };
  WebAssembly.instantiate = async () => ({ instance: {} });
  class Go {
    importObject = {};
    run() {
      starts++;
      globalThis[bridge] = (inputs) => ({ data: inputs[0].data });
      globalThis[bridge + "Ready"]();
      return new Promise(() => {});
    }
  }
  const merge = createMerge(async () => Go, "unused");
  const input = [{ mimeType: "application/pdf", data: new Uint8Array([1, 2]) }];
  const result = await Promise.all([merge(input), merge(input)]);
  assert.deepEqual([...result[0]], [1, 2]);
  assert.equal(requests, 1);
  assert.equal(starts, 1);
});

test("failed downloads can be retried", async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 });
  const merge = createMerge(async () => class {}, "unused");
  const input = [{ mimeType: "application/pdf", data: new Uint8Array([1]) }];
  await assert.rejects(merge(input), /HTTP 404/);
  assert.equal(globalThis[key], undefined);
});
