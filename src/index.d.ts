export type Geometry = {
  page: "a4" | "letter" | "legal";
  orientation?: "portrait" | "landscape";
  fit?: "contain" | "cover";
};

export type BundleDocument =
  | { mimeType: "text/html"; data: string | Uint8Array; geometry?: Omit<Geometry, "fit"> }
  | { mimeType: "image/png" | "image/jpeg"; data: Uint8Array; geometry?: Geometry }
  | { mimeType: "application/pdf"; data: Uint8Array; geometry?: Geometry };

/** Convert and concatenate documents, preserving input page order. Browser API. */
export declare function merge(documents: readonly BundleDocument[]): Promise<Uint8Array>;

export type SupportedCSSProperty = {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly values: readonly string[];
  readonly category: string;
  readonly notes: string;
};

export type SupportedCSS = {
  readonly folioVersion: string;
  readonly properties: readonly SupportedCSSProperty[];
  readonly documentation: string;
};

/** CSS properties recognized by the bundled Folio engine, derived from its pinned documentation. */
export declare function getSupportedCSS(): SupportedCSS;
