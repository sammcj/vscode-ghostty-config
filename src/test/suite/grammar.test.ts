import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';
import { loadSchemaFromPath } from '../../schema/loader';

const schemaPath = path.join(__dirname, '../../../schema/ghostty-config-syntax.schema.json');
const grammarPath = path.join(__dirname, '../../../syntaxes/ghostty-config-syntax.tmLanguage.json');
const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');

const SCOPE_PREFIX = 'variable.other.property.';
const CATCH_ALL_SCOPE = `${SCOPE_PREFIX}ghostty`;
const BOUNDARY_PREFIX = '(?<![\\w-])';
const BOUNDARY_SUFFIX = '(?![\\w-])';

interface GrammarPattern {
  name?: string;
  match?: string;
}

function configKeyPatterns(): GrammarPattern[] {
  const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
  return grammar.repository['config-keys'].patterns;
}

/** The category groups, excluding the generic catch-all that must come last. */
function propertyGroups(): Array<{ name: string; match: string; alternatives: string[] }> {
  return configKeyPatterns()
    .filter((p): p is Required<GrammarPattern> =>
      Boolean(p.name?.startsWith(SCOPE_PREFIX) && p.match) && p.name !== CATCH_ALL_SCOPE
    )
    .map((p) => ({
      name: p.name,
      match: p.match,
      alternatives: p.match
        .replace(BOUNDARY_PREFIX, '')
        .replace(BOUNDARY_SUFFIX, '')
        .replace(/^\(|\)$/g, '')
        .split('|'),
    }));
}

async function loadGrammar(): Promise<textmate.IGrammar> {
  const wasm = fs.readFileSync(wasmPath);
  await oniguruma.loadWASM(wasm);

  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
      createOnigString: (str) => new oniguruma.OnigString(str),
    }),
    loadGrammar: async () =>
      textmate.parseRawGrammar(fs.readFileSync(grammarPath, 'utf8'), grammarPath),
  });

  const grammar = await registry.loadGrammar('source.ghostty');
  assert.ok(grammar, 'grammar failed to load');
  return grammar;
}

suite('TextMate grammar', () => {
  test('scopes exactly the keys the schema defines', () => {
    const schema = loadSchemaFromPath(schemaPath);
    const scoped = new Set(propertyGroups().flatMap((g) => g.alternatives));
    const defined = new Set(Object.keys(schema.options));

    const missing = [...defined].filter((k) => !scoped.has(k)).sort();
    const unknown = [...scoped].filter((k) => !defined.has(k)).sort();

    assert.deepStrictEqual(missing, [], `keys in schema but not scoped: ${missing.join(', ')}`);
    assert.deepStrictEqual(unknown, [], `keys scoped but not in schema: ${unknown.join(', ')}`);
  });

  test('scopes each key in exactly one group', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const group of propertyGroups()) {
      for (const key of group.alternatives) {
        const previous = seen.get(key);
        if (previous) {
          duplicates.push(`${key} (${previous}, ${group.name})`);
        } else {
          seen.set(key, group.name);
        }
      }
    }

    assert.deepStrictEqual(duplicates, []);
  });

  test('every group uses hyphen-aware boundaries', () => {
    // A plain \b treats the hyphen as a boundary, so \b(background)\b would
    // match the prefix of background-opacity and steal its scope.
    const groups = propertyGroups();
    assert.ok(groups.length > 1);

    for (const group of groups) {
      assert.ok(
        group.match.startsWith(BOUNDARY_PREFIX) && group.match.endsWith(BOUNDARY_SUFFIX),
        `${group.name} uses word boundaries that break on hyphenated keys`
      );
    }
  });

  test('the generic catch-all stays last', () => {
    // Anything after it is unreachable; anything before it that is too greedy
    // would shadow the category groups.
    const patterns = configKeyPatterns();
    const index = patterns.findIndex((p) => p.name === CATCH_ALL_SCOPE);

    assert.notStrictEqual(index, -1, 'catch-all pattern is missing');
    assert.strictEqual(index, patterns.length - 1, 'catch-all pattern must come last');
  });

  test('tokenises every schema key to its category scope', async () => {
    const schema = loadSchemaFromPath(schemaPath);
    const grammar = await loadGrammar();

    const failures: string[] = [];
    for (const key of Object.keys(schema.options)) {
      const line = `${key} = value`;
      const tokens = grammar.tokenizeLine(line, textmate.INITIAL).tokens;
      const token = tokens.find((t) => t.startIndex === 0);
      const scope = token?.scopes.find((s) => s.startsWith(SCOPE_PREFIX));

      if (!scope || scope === CATCH_ALL_SCOPE) {
        failures.push(`${key}: ${scope ?? 'no property scope'}`);
      } else if (token?.endIndex !== key.length) {
        failures.push(`${key}: scope covers 0..${token?.endIndex} of ${key.length}`);
      }
    }

    assert.deepStrictEqual(failures, [], failures.slice(0, 10).join('\n'));
  });
});
