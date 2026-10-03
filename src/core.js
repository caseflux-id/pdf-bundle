// Copyright 2026 Caseflux. SPDX-License-Identifier: Apache-2.0
const VERSION = "__VERSION__";
const BRIDGE = "__caseflux_pdf_bundle_" + VERSION.replaceAll(".", "_");
const KEY = Symbol.for("@caseflux-id/pdf-bundle@" + VERSION);
const MIME_TYPES = new Set(["application/pdf", "text/html", "image/png", "image/jpeg"]);

export function normalize(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new TypeError("Expected a non-empty array of documents");
  }
  return documents.map((document, index) => {
    if (!document || !MIME_TYPES.has(document.mimeType)) {
      throw new TypeError(`document ${index}: unsupported mimeType`);
    }
    let data = document.data;
    if (typeof data === "string" && document.mimeType === "text/html") {
      data = new TextEncoder().encode(data);
    }
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new TypeError(`document ${index}: data must be a non-empty Uint8Array (or string for HTML)`);
    }
    return { mimeType: document.mimeType, data };
  });
}

async function initialize(loadGo, wasmURL, state) {
  const [Go, response] = await Promise.all([loadGo(), fetch(wasmURL)]);
  if (!response.ok) throw new Error(`Unable to load PDF WASM: HTTP ${response.status}`);
  const go = new Go();
  let instantiated;
  // Some static hosts send the wrong MIME type for .wasm files.
  if (WebAssembly.instantiateStreaming) {
    try {
      instantiated = await WebAssembly.instantiateStreaming(response.clone(), go.importObject);
    } catch {
      instantiated = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    }
  } else {
    instantiated = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  }
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const timer = setTimeout(() => rejectReady(new Error("PDF WASM initialization timed out")), 30000);
  globalThis[BRIDGE + "Ready"] = resolveReady;
  try {
    // Go's main stays alive. Await its readiness signal, not go.run().
    Promise.resolve(go.run(instantiated.instance)).then(
      () => { state.error = new Error("PDF WASM runtime exited"); rejectReady(state.error); },
      (error) => { state.error = error; rejectReady(error); },
    );
    await ready;
    if (typeof globalThis[BRIDGE] !== "function") throw new Error("PDF WASM bridge is unavailable");
    return globalThis[BRIDGE];
  } finally {
    clearTimeout(timer);
    delete globalThis[BRIDGE + "Ready"];
  }
}

export function createMerge(loadGo, wasmURL) {
  return async function merge(documents) {
    const normalized = normalize(documents);
    let state = globalThis[KEY];
    if (!state) {
      state = { error: null, promise: null };
      globalThis[KEY] = state;
      state.promise = initialize(loadGo, wasmURL, state).catch((error) => {
        if (globalThis[KEY] === state) delete globalThis[KEY];
        throw error;
      });
    }
    const engineMerge = await state.promise;
    if (state.error) throw state.error;
    const result = engineMerge(normalized);
    if (result.error) throw new Error(result.error);
    if (!(result.data instanceof Uint8Array)) throw new Error("Invalid PDF WASM response");
    return result.data;
  };
}
