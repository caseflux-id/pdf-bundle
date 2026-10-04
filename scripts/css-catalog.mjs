import { join } from "node:path";

const TABLE_HEADER = "| Property | Aliases | Accepted values | Notes |";
const EM_DASH = "\u2014";
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function splitRow(line) {
  const cells = line.split("|");
  if (cells.length !== 6 || cells[0].trim() !== "" || cells[5].trim() !== "") return null;
  return cells.slice(1, 5).map((cell) => cell.trim());
}

function backtickTokens(cell) {
  const tokens = [];
  const pattern = /`([^`]+)`/g;
  let match;
  while ((match = pattern.exec(cell)) !== null) tokens.push(match[1]);
  return tokens;
}

function stripEmphasis(value) {
  return value.replaceAll("*", "").trim();
}

function parseSummary(lines) {
  const counts = new Map();
  let total = null;
  let active = false;
  for (const line of lines) {
    if (/^##\s+At a glance\s*$/.test(line)) {
      active = true;
      continue;
    }
    if (active && /^##\s+/.test(line)) break;
    if (!active) continue;
    const cells = line.split("|");
    if (cells.length !== 4 || cells[0].trim() !== "" || cells[3].trim() !== "") continue;
    const category = stripEmphasis(cells[1]);
    const raw = stripEmphasis(cells[2]);
    if (category === "Category" || raw === "Properties" || /^:?-+:?$/.test(raw)) continue;
    const count = Number(raw);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Invalid property count "${raw}" for category "${category}"`);
    }
    if (category === "Total") {
      total = count;
      continue;
    }
    counts.set(category, count);
  }
  if (total === null || counts.size === 0) throw new Error("At a glance summary is missing");
  return { counts, total };
}

function parseProperties(lines) {
  const properties = [];
  let category = null;
  let index = 0;
  while (index < lines.length) {
    const heading = lines[index].match(/^##\s+(.+?)\s*$/);
    if (heading) {
      category = heading[1].trim();
      index++;
      continue;
    }
    if (lines[index].trim() !== TABLE_HEADER) {
      index++;
      continue;
    }
    if (!category) throw new Error("Property table found before any category heading");
    index += 2;
    while (index < lines.length && lines[index].trim() !== "") {
      const cells = splitRow(lines[index]);
      if (!cells) throw new Error(`Malformed property row in ${category}: ${lines[index]}`);
      const names = backtickTokens(cells[0]);
      if (names.length !== 1 || !NAME_PATTERN.test(names[0])) {
        throw new Error(`Invalid property name in ${category}: ${cells[0]}`);
      }
      const name = names[0];
      const aliases = cells[1] === EM_DASH ? [] : backtickTokens(cells[1]);
      if (cells[1] !== EM_DASH && aliases.length === 0) {
        throw new Error(`Malformed aliases for "${name}"`);
      }
      const values = cells[2] === EM_DASH ? [] : backtickTokens(cells[2]);
      if (cells[2] !== EM_DASH && values.length === 0) {
        throw new Error(`Malformed accepted values for "${name}"`);
      }
      const notes = cells[3] === EM_DASH ? "" : cells[3];
      properties.push({ name, aliases, values, category, notes });
      index++;
    }
  }
  return properties;
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 1;
}

function splitCells(line) {
  return line.trim().split("|").slice(1, -1).map((cell) => cell.trim());
}

function isSeparatorRow(line) {
  return isTableRow(line) && splitCells(line).every((cell) => /^:?-+:?$/.test(cell));
}

// Walks the document once and collects every markdown table together with the
// `##`/`###` headings it sits under, so section-specific parsers can select the
// tables they care about without rescanning.
function parseTables(lines) {
  const tables = [];
  let section = null;
  let subsection = null;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      section = h2[1].trim();
      subsection = null;
      index++;
      continue;
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      subsection = h3[1].trim();
      index++;
      continue;
    }
    if (isTableRow(line) && index + 1 < lines.length && isSeparatorRow(lines[index + 1])) {
      const header = splitCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitCells(lines[index]));
        index++;
      }
      tables.push({ section, subsection, header, rows });
      continue;
    }
    index++;
  }
  return tables;
}

function normalizeAtRuleName(token) {
  const match = token.match(/^@([a-zA-Z-]+)/);
  return match ? match[1] : null;
}

function parseAtRules(tables) {
  const recognized = tables.find(
    (table) => table.section === "At-rules" && table.subsection === null && table.header[0] === "Rule",
  );
  const ignored = tables.find(
    (table) =>
      table.section === "At-rules" &&
      table.subsection === "Silently ignored at-rules" &&
      table.header[0] === "Rule",
  );
  const entries = [];
  const recognizedRules = new Set();
  if (recognized) {
    for (const row of recognized.rows) {
      const token = backtickTokens(row[0]).find((candidate) => candidate.startsWith("@"));
      if (!token) continue;
      const name = normalizeAtRuleName(token);
      const rule = row[0].replaceAll("`", "").trim();
      if (!name || recognizedRules.has(rule)) continue;
      recognizedRules.add(rule);
      entries.push({
        rule,
        name,
        context: row[1] === EM_DASH ? "" : row[1],
        notes: row[2] === EM_DASH ? "" : row[2],
        ignored: false,
      });
    }
  }
  if (ignored) {
    const ignoredNames = new Set();
    for (const row of ignored.rows) {
      for (const token of backtickTokens(row[0])) {
        const name = normalizeAtRuleName(token);
        if (!name || ignoredNames.has(name)) continue;
        ignoredNames.add(name);
        entries.push({
          rule: token,
          name,
          context: "",
          notes: row[1] === EM_DASH ? "" : row[1],
          ignored: true,
        });
      }
    }
  }
  return entries;
}

const PSEUDO_NAME_PATTERN = /^:{1,2}[a-zA-Z-]+$/;

function parsePseudoTable(table) {
  const entries = [];
  if (!table) return entries;
  for (const row of table.rows) {
    const token = backtickTokens(row[0])[0];
    if (!token) continue;
    const name = token.replace(/^:{1,2}/, "").replace(/\(.*$/, "").trim();
    if (!name) continue;
    entries.push({ name, syntax: token, notes: row[1] === EM_DASH ? "" : row[1], ignored: false });
  }
  return entries;
}

function parsePseudoProse(lines, subsection, sigil) {
  const entries = [];
  const seen = new Set();
  let section = null;
  let current = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      section = h2[1].trim();
      current = null;
      continue;
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      current = h3[1].trim();
      continue;
    }
    if (section !== "Selectors" || current !== subsection) continue;
    if (!/not supported/i.test(line)) continue;
    for (const token of backtickTokens(line)) {
      if (!PSEUDO_NAME_PATTERN.test(token) || !token.startsWith(sigil)) continue;
      if (sigil === ":" && token.startsWith("::")) continue;
      const name = token.replace(/^:{1,2}/, "");
      if (seen.has(name)) continue;
      seen.add(name);
      entries.push({ name, syntax: token, notes: "", ignored: true });
    }
  }
  return entries;
}

const FUNCTION_TOKEN_PATTERN = /^([a-zA-Z][\w-]*)\(\)$/;

function parseFunctionTables(tables) {
  const entries = [];
  for (const table of tables) {
    if (table.section !== "Functions" || table.header[0] !== "Function") continue;
    for (const row of table.rows) {
      for (const token of backtickTokens(row[0])) {
        const match = token.match(FUNCTION_TOKEN_PATTERN);
        if (!match) continue;
        entries.push({
          name: match[1],
          category: table.subsection ?? "",
          notes: row[1] === EM_DASH ? "" : row[1],
          ignored: false,
        });
      }
    }
  }
  return entries;
}

function parseFunctionProse(lines) {
  const entries = [];
  const seen = new Set();
  let section = null;
  let category = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      section = h2[1].trim();
      category = null;
      continue;
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      category = h3[1].trim();
      continue;
    }
    if (section !== "Functions") continue;
    if (!/unsupported|not supported/i.test(line)) continue;
    for (const token of backtickTokens(line)) {
      const match = token.match(FUNCTION_TOKEN_PATTERN);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      entries.push({ name: match[1], category: category ?? "", notes: "", ignored: true });
    }
  }
  return entries;
}

const GLOSSARY_FUNCTION_PATTERN = /^([a-zA-Z][\w-]*)\(/;
const NEGATIVE_CLAUSE_PATTERN = /not supported|unsupported|not parsed|silently ignored/i;

// Functions are documented in two places: the dedicated Functions tables and
// the value-form glossary (e.g. `repeat()` is only described under
// `<track-list>`). Collect the latter so the supported set is complete.
function parseValueFormGlossary(lines) {
  const names = [];
  const seen = new Set();
  let section = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      section = h2[1].trim();
      continue;
    }
    if (section !== "Value-form glossary") continue;
    for (const clause of line.split(/\.\s|\u2014/)) {
      if (NEGATIVE_CLAUSE_PATTERN.test(clause)) continue;
      for (const token of backtickTokens(clause)) {
        const match = token.match(GLOSSARY_FUNCTION_PATTERN);
        if (!match) continue;
        const name = match[1];
        // Skip single-letter placeholders like `X()`/`Y()` in transform lists.
        if (name.length < 2 || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

function assertUnique(properties) {
  const owners = new Map();
  for (const property of properties) {
    if (owners.has(property.name)) {
      throw new Error(`Duplicate property "${property.name}"`);
    }
    owners.set(property.name, `property "${property.name}"`);
  }
  for (const property of properties) {
    for (const alias of property.aliases) {
      if (owners.has(alias)) {
        throw new Error(`Alias "${alias}" of "${property.name}" collides with ${owners.get(alias)}`);
      }
      owners.set(alias, `alias of "${property.name}"`);
    }
  }
}

export function parseCSSSupportMarkdown(markdown, folioVersion) {
  if (typeof markdown !== "string" || markdown.length === 0) {
    throw new Error("Folio CSS documentation is empty");
  }
  const lines = markdown.split(/\r?\n/);
  const summary = parseSummary(lines);
  const properties = parseProperties(lines);
  assertUnique(properties);
  const actual = new Map();
  for (const property of properties) {
    actual.set(property.category, (actual.get(property.category) ?? 0) + 1);
  }
  for (const [category, expected] of summary.counts) {
    const found = actual.get(category) ?? 0;
    if (found !== expected) {
      throw new Error(`Category "${category}": documented ${expected} properties, parsed ${found}`);
    }
  }
  for (const category of actual.keys()) {
    if (!summary.counts.has(category)) throw new Error(`Category "${category}" is absent from At a glance`);
  }
  if (properties.length !== summary.total) {
    throw new Error(`Total: documented ${summary.total} properties, parsed ${properties.length}`);
  }
  const tables = parseTables(lines);
  const pseudoClasses = [
    ...parsePseudoTable(
      tables.find(
        (table) =>
          table.section === "Selectors" &&
          table.subsection === "Pseudo-classes" &&
          table.header[0] === "Pseudo-class",
      ),
    ),
    ...parsePseudoProse(lines, "Pseudo-classes", ":"),
  ];
  const pseudoElements = [
    ...parsePseudoTable(
      tables.find(
        (table) =>
          table.section === "Selectors" &&
          table.subsection === "Pseudo-elements" &&
          table.header[0] === "Pseudo-element",
      ),
    ),
    ...parsePseudoProse(lines, "Pseudo-elements", "::"),
  ];
  const functions = [...parseFunctionTables(tables), ...parseFunctionProse(lines)];
  const knownFunctions = new Set(functions.map((fn) => fn.name));
  for (const name of parseValueFormGlossary(lines)) {
    if (knownFunctions.has(name)) continue;
    knownFunctions.add(name);
    functions.push({ name, category: "Value-form glossary", notes: "", ignored: false });
  }
  return {
    folioVersion,
    properties,
    atRules: parseAtRules(tables),
    pseudoClasses,
    pseudoElements,
    functions,
    documentation: markdown,
  };
}

export function resolveFolioModule(runGo) {
  const info = JSON.parse(runGo(["list", "-m", "-json", "github.com/carlos7ags/folio"]));
  if (info.Replace) {
    const path = info.Replace.Path ?? "unknown";
    const version = info.Replace.Version ? `@${info.Replace.Version}` : "";
    throw new Error(`github.com/carlos7ags/folio is replaced by ${path}${version}; refusing to derive CSS support from an ambiguous module path`);
  }
  if (!info.Dir) throw new Error("github.com/carlos7ags/folio has no module directory");
  if (!info.Version) throw new Error("github.com/carlos7ags/folio has no selected version");
  return { version: info.Version, directory: info.Dir };
}

export async function loadFolioCatalog(runGo, readText) {
  const { version, directory } = resolveFolioModule(runGo);
  const markdown = await readText(join(directory, "docs", "CSS_SUPPORT.md"));
  return parseCSSSupportMarkdown(markdown, version);
}

export function renderCSSModule(catalog) {
  return [
    `const DATA = ${JSON.stringify(catalog)};`,
    "function deepFreeze(value) {",
    "  if (value !== null && typeof value === \"object\") {",
    "    for (const key of Object.keys(value)) deepFreeze(value[key]);",
    "    Object.freeze(value);",
    "  }",
    "  return value;",
    "}",
    "export const CATALOG = deepFreeze(DATA);",
    "",
  ].join("\n");
}
