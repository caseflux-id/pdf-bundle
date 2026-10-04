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
