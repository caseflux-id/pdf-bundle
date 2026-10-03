// Copyright 2026 Caseflux. SPDX-License-Identifier: Apache-2.0
import { createMerge } from "./core.js";

const base = "https://cdn.jsdelivr.net/npm/@caseflux-id/pdf-bundle@__VERSION__/dist/";
export const merge = createMerge(
  async () => (await import(/* webpackIgnore: true */ base + "wasm_exec.js")).Go,
  base + "engine.wasm",
);
