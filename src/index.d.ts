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

export type SupportedCSSAtRule = {
  /** Raw rule label as documented, e.g. "@page margin boxes". */
  readonly rule: string;
  /** Normalized at-rule name without the leading "@", e.g. "page". */
  readonly name: string;
  /** Selectors or context the rule accepts, or "" when unspecified. */
  readonly context: string;
  readonly notes: string;
  /** True for rules Folio silently drops during parsing. */
  readonly ignored: boolean;
};

export type SupportedCSSSelector = {
  /** Normalized name without leading colons or arguments, e.g. "nth-child". */
  readonly name: string;
  /** Documented syntax, e.g. ":nth-child(<expr>)" or "::before". */
  readonly syntax: string;
  readonly notes: string;
  /** True for selectors Folio explicitly does not support. */
  readonly ignored: boolean;
};

export type SupportedCSSFunction = {
  /** Normalized name without arguments or parentheses, e.g. "linear-gradient". */
  readonly name: string;
  /** Documented group, e.g. "Math", "Color", "Gradients", "Transform". */
  readonly category: string;
  readonly notes: string;
  /** True for functions Folio explicitly does not support. */
  readonly ignored: boolean;
};

export type SupportedCSS = {
  readonly folioVersion: string;
  readonly properties: readonly SupportedCSSProperty[];
  readonly atRules: readonly SupportedCSSAtRule[];
  readonly pseudoClasses: readonly SupportedCSSSelector[];
  readonly pseudoElements: readonly SupportedCSSSelector[];
  readonly functions: readonly SupportedCSSFunction[];
  readonly documentation: string;
};

/** CSS features recognized by the bundled Folio engine, derived from its pinned documentation. */
export declare function getSupportedCSS(): SupportedCSS;
