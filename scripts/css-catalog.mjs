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
  return { folioVersion, properties, documentation: markdown };
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
