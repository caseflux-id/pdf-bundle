// Copyright 2026 Caseflux. SPDX-License-Identifier: Apache-2.0
import { Go } from "./wasm_exec.js";
import { createMerge } from "./core.js";

export const merge = createMerge(
  async () => Go,
  new URL("./engine.wasm", import.meta.url),
);
