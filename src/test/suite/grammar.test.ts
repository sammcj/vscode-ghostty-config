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

  test('lists the same keybind actions as the schema', () => {
    const schema = loadSchemaFromPath(schemaPath);
    const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
    const match: string = grammar.repository['keybind-action'].patterns[0].match;
    const alternation = /^\\b\((.+)\)\\b$/.exec(match);

    assert.ok(alternation, 'keybind action pattern is not a plain alternation');
    assert.deepStrictEqual(
      [...new Set(alternation[1].split('|'))].sort(),
      [...schema.types['keybind'].actions ?? []].sort()
    );
  });

  test('scopes keybind values without stealing other values containing =', async () => {
    const grammar = await loadGrammar();
    const scopesAt = (line: string, index: number) =>
      grammar
        .tokenizeLine(line, textmate.INITIAL)
        .tokens.filter((t) => t.startIndex <= index && t.endIndex > index)
        .flatMap((t) => t.scopes);

    // A keybind trigger and action still resolve, including a literal = key.
    const keybind = 'keybind = super+shift+==equalize_splits';
    assert.ok(
      scopesAt(keybind, keybind.indexOf('+')).includes('keyword.operator.plus.ghostty'),
      'expected the trigger separator to be scoped'
    );
    assert.ok(
      scopesAt(keybind, keybind.indexOf('equalize_splits')).includes('support.function.action.ghostty'),
      'expected the action after a literal = trigger to be scoped'
    );

    // palette entries contain an = but are not keybinds, so #keybind-value
    // must not claim them and swallow the colour.
    const palette = 'palette = 0=#000000';
    assert.ok(
      scopesAt(palette, palette.indexOf('#000000')).includes('constant.other.color.hex.ghostty'),
      'expected the palette colour to keep its colour scope'
    );
  });

  test('scopes the keybind clear directive', async () => {
    const grammar = await loadGrammar();
    const tokens = grammar.tokenizeLine('keybind = clear', textmate.INITIAL).tokens;
    const clear = tokens.find((t) => t.startIndex === 10);

    assert.ok(clear?.scopes.includes('keyword.control.ghostty'));
    assert.ok(
      tokens[0].scopes.includes('variable.other.property.keybind.ghostty'),
      'the key should still be scoped as a config key'
    );
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
