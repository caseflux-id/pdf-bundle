import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  parseCSSSupportMarkdown,
  resolveFolioModule,
  loadFolioCatalog,
} from "../scripts/css-catalog.mjs";

const HEADER = "| Property | Aliases | Accepted values | Notes |\n|---|---|---|---|\n";

function document(categories, total) {
  const summary = categories
    .map(([name, rows]) => `| ${name} | ${rows.length} |`)
    .join("\n");
  const tables = categories
    .map(([name, rows]) => `## ${name}\n\n${HEADER}${rows.join("\n")}\n`)
    .join("\n");
  return `# Folio CSS support\n\n## At a glance\n\n| Category | Properties |\n|---|---:|\n${summary}\n| **Total** | **${total}** |\n\n${tables}`;
}

const baseline = document(
  [["Typography", [
    "| `font-size` | — | `<length>`, `<percentage>` | — |",
    "| `hyphens` | `-webkit-hyphens` | `none`, `manual`, `auto` | — |",
  ]]],
  2,
);

test("parses canonical names, aliases, values, categories and notes", () => {
  const catalog = parseCSSSupportMarkdown(baseline, "v0.10.1");
  assert.equal(catalog.folioVersion, "v0.10.1");
  assert.equal(catalog.documentation, baseline);
  assert.deepEqual(catalog.properties, [
    {
      name: "font-size",
      aliases: [],
      values: ["<length>", "<percentage>"],
      category: "Typography",
      notes: "",
    },
    {
      name: "hyphens",
      aliases: ["-webkit-hyphens"],
      values: ["none", "manual", "auto"],
      category: "Typography",
      notes: "",
    },
  ]);
});

test("handles multiple aliases and preserves notes", () => {
  const markdown = document(
    [["Grid", ["| `gap` | `grid-gap`, `gutters` | `<row-gap>` | Sets RowGap; note a, b. |"]]],
    1,
  );
  const { properties } = parseCSSSupportMarkdown(markdown, "v0.10.1");
  assert.deepEqual(properties[0].aliases, ["grid-gap", "gutters"]);
  assert.equal(properties[0].notes, "Sets RowGap; note a, b.");
});

test("rejects duplicate canonical properties", () => {
  const markdown = document(
    [["Color", [
      "| `color` | — | `<color>` | — |",
      "| `color` | — | `<color>` | — |",
    ]]],
    2,
  );
  assert.throws(() => parseCSSSupportMarkdown(markdown, "v0.10.1"), /Duplicate property "color"/);
});

test("rejects alias collisions", () => {
  const markdown = document(
    [["Typography", [
      "| `font-size` | `text-size` | `<length>` | — |",
      "| `text-size` | — | `<length>` | — |",
    ]]],
    2,
  );
  assert.throws(() => parseCSSSupportMarkdown(markdown, "v0.10.1"), /collides with property "text-size"/);
});

test("rejects malformed rows", () => {
  const markdown = document(
    [["Layout", ["| `display` | `block` | missing a column |"]]],
    1,
  );
  assert.throws(() => parseCSSSupportMarkdown(markdown, "v0.10.1"), /Malformed property row/);
});

test("rejects category count mismatches", () => {
  const markdown = document(
    [["Layout", ["| `display` | — | `block` | — |"]]],
    2,
  );
  assert.throws(() => parseCSSSupportMarkdown(markdown, "v0.10.1"), /Total: documented 2 properties, parsed 1/);
});

test("rejects per-category count mismatches", () => {
  const markdown = [
    "# Folio CSS support",
    "",
    "## At a glance",
    "",
    "| Category | Properties |",
    "|---|---:|",
    "| Layout | 2 |",
    "| **Total** | **2** |",
    "",
    "## Layout",
    "",
    HEADER + "| `display` | — | `block` | — |\n",
  ].join("\n");
  assert.throws(() => parseCSSSupportMarkdown(markdown, "v0.10.1"), /Category "Layout": documented 2 properties, parsed 1/);
});

test("rejects categories absent from the summary", () => {
  const markdown = [
    "# Folio CSS support",
    "",
    "## At a glance",
    "",
    "| Category | Properties |",
    "|---|---:|",
    "| Layout | 1 |",
    "| **Total** | **1** |",
    "",
    "## Layout",
    "",
    HEADER + "| `display` | — | `block` | — |\n",
    "## Effects",
    "",
    HEADER + "| `opacity` | — | `<number>` | — |\n",
  ].join("\n");
  assert.throws(() => parseCSSSupportMarkdown(markdown, "v0.10.1"), /Category "Effects" is absent from At a glance/);
});

test("rejects replacement modules", () => {
  const runGo = () => JSON.stringify({
    Version: "v0.10.1",
    Dir: "/tmp/folio",
    Replace: { Path: "example.com/fork", Version: "v1.0.0" },
  });
  assert.throws(() => resolveFolioModule(runGo), /replaced by example.com\/fork@v1.0.0/);
});

test("loads the pinned module documentation", async () => {
  const runGo = () => JSON.stringify({ Version: "v0.10.1", Dir: "/pinned/folio" });
  const readText = async (path) => {
    assert.equal(path, join("/pinned/folio", "docs", "CSS_SUPPORT.md"));
    return baseline;
  };
  const catalog = await loadFolioCatalog(runGo, readText);
  assert.equal(catalog.folioVersion, "v0.10.1");
  assert.equal(catalog.properties.length, 2);
});

const extended = [
  "# Folio CSS support",
  "",
  "## At a glance",
  "",
  "| Category | Properties |",
  "|---|---:|",
  "| Layout | 1 |",
  "| **Total** | **1** |",
  "",
  "## Layout",
  "",
  HEADER + "| `display` | — | `block` | — |\n",
  "## Selectors",
  "",
  "### Pseudo-classes",
  "",
  "| Pseudo-class | Notes |",
  "|---|---|",
  "| `:root` | The document root. |",
  "| `:nth-child(<expr>)` | Position match. |",
  "",
  "Interaction-state pseudo-classes (`:hover`, `:focus`) are not supported — PDFs are static.",
  "",
  "### Pseudo-elements",
  "",
  "| Pseudo-element | Notes |",
  "|---|---|",
  "| `::before` | Generated content. |",
  "",
  "The double-colon form is required — single-colon legacy forms (`:before`, `:after`) are not recognized. `::first-letter`, `::selection` are not supported.",
  "",
  "## At-rules",
  "",
  "| Rule | Selectors / context | Notes |",
  "|---|---|---|",
  "| `@font-face` | — | Custom fonts. |",
  "| `@page` | `:first`, no selector | Page styling. |",
  "| `@page` margin boxes | `@top-left` | Running headers. |",
  "| `@media print` | — | Print medium. |",
  "",
  "### Silently ignored at-rules",
  "",
  "| Rule | Why |",
  "|---|---|",
  "| `@media screen`, `@media (max-width: ...)`, etc. | Fixed geometry. |",
  "| `@keyframes`, `@-webkit-keyframes` | No timeline. |",
  "| `@import` | Not followed. |",
  "",
  "## Functions",
  "",
  "### Math",
  "",
  "| Function | Notes |",
  "|---|---|",
  "| `calc()` | Math. |",
  "",
  "Known limitations: `calc()` does not yet expand inside `rotate()`.",
  "",
  "### Color",
  "",
  "| Function | Notes |",
  "|---|---|",
  "| `rgb()` | Color. |",
  "| `cmyk()` / `device-cmyk()` | CMYK. |",
  "",
  "Known unsupported color functions: `oklch()`, `color-mix()` — precompute.",
  "",
  "### Gradients",
  "",
  "| Function | Notes |",
  "|---|---|",
  "| `linear-gradient()` | Gradient. |",
  "",
  "`conic-gradient()` is not supported.",
].join("\n");

test("parses pseudo-classes and pseudo-elements, including unsupported prose", () => {
  const catalog = parseCSSSupportMarkdown(extended, "v0.10.1");
  assert.deepEqual(
    catalog.pseudoClasses.map(({ name, ignored }) => ({ name, ignored })),
    [
      { name: "root", ignored: false },
      { name: "nth-child", ignored: false },
      { name: "hover", ignored: true },
      { name: "focus", ignored: true },
    ],
  );
  assert.equal(catalog.pseudoClasses[1].syntax, ":nth-child(<expr>)");
  assert.deepEqual(
    catalog.pseudoElements.map(({ name, ignored }) => ({ name, ignored })),
    [
      { name: "before", ignored: false },
      { name: "first-letter", ignored: true },
      { name: "selection", ignored: true },
    ],
  );
});

test("parses recognized and silently ignored at-rules", () => {
  const catalog = parseCSSSupportMarkdown(extended, "v0.10.1");
  assert.deepEqual(
    catalog.atRules.map(({ rule, name, ignored }) => ({ rule, name, ignored })),
    [
      { rule: "@font-face", name: "font-face", ignored: false },
      { rule: "@page", name: "page", ignored: false },
      { rule: "@page margin boxes", name: "page", ignored: false },
      { rule: "@media print", name: "media", ignored: false },
      { rule: "@media screen", name: "media", ignored: true },
      { rule: "@keyframes", name: "keyframes", ignored: true },
      { rule: "@-webkit-keyframes", name: "-webkit-keyframes", ignored: true },
      { rule: "@import", name: "import", ignored: true },
    ],
  );
});

test("parses supported functions by category and unsupported prose", () => {
  const catalog = parseCSSSupportMarkdown(extended, "v0.10.1");
  assert.deepEqual(
    catalog.functions.map(({ name, category, ignored }) => ({ name, category, ignored })),
    [
      { name: "calc", category: "Math", ignored: false },
      { name: "rgb", category: "Color", ignored: false },
      { name: "cmyk", category: "Color", ignored: false },
      { name: "device-cmyk", category: "Color", ignored: false },
      { name: "linear-gradient", category: "Gradients", ignored: false },
      { name: "oklch", category: "Color", ignored: true },
      { name: "color-mix", category: "Color", ignored: true },
      { name: "conic-gradient", category: "Gradients", ignored: true },
    ],
  );
});

const withGlossary = [
  "# Folio CSS support",
  "",
  "## At a glance",
  "",
  "| Category | Properties |",
  "|---|---:|",
  "| Layout | 1 |",
  "| **Total** | **1** |",
  "",
  "## Layout",
  "",
  HEADER + "| `display` | — | `block` | — |\n",
  "## Value-form glossary",
  "",
  "| Placeholder | Meaning |",
  "|---|---|",
  "| `<track-list>` | Space-separated track sizes. Examples: `1fr 1fr`, `100px auto`, `repeat(3, 1fr)`. |",
  "| `<color>` | Any of `rgb()`, `rgba()`. Folio renders sRGB only — `oklch()` and `color-mix()` are not supported. |",
  "| `<transform-function>` | `translate()`, `translateX()`/`Y()`, `scale()`/`X()`/`Y()`. |",
].join("\n");

test("adds functions documented only in the value-form glossary", () => {
  const catalog = parseCSSSupportMarkdown(withGlossary, "v0.10.1");
  assert.deepEqual(
    catalog.functions.map(({ name, category, ignored }) => ({ name, category, ignored })),
    [
      { name: "repeat", category: "Value-form glossary", ignored: false },
      { name: "rgb", category: "Value-form glossary", ignored: false },
      { name: "rgba", category: "Value-form glossary", ignored: false },
      { name: "translate", category: "Value-form glossary", ignored: false },
      { name: "translateX", category: "Value-form glossary", ignored: false },
      { name: "scale", category: "Value-form glossary", ignored: false },
    ],
  );
});

test("returns empty section arrays when the documentation omits them", () => {
  const catalog = parseCSSSupportMarkdown(baseline, "v0.10.1");
  assert.deepEqual(catalog.atRules, []);
  assert.deepEqual(catalog.pseudoClasses, []);
  assert.deepEqual(catalog.pseudoElements, []);
  assert.deepEqual(catalog.functions, []);
});
