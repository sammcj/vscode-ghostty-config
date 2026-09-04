import * as assert from 'assert';
import * as path from 'path';
import {
  loadSchemaFromPath,
  loadSchema,
  getSchema,
  getOptionInfo,
  isRepeatableKey,
} from '../../schema/loader';

const schemaPath = path.join(__dirname, '../../../schema/ghostty-config-syntax.schema.json');

suite('Schema Loader', () => {
  test('loads schema successfully', () => {
    const schema = loadSchemaFromPath(schemaPath);
    assert.ok(schema);
    assert.ok(schema.options);
    assert.ok(Object.keys(schema.options).length > 0);
  });

  test('schema contains expected options', () => {
    const schema = loadSchemaFromPath(schemaPath);
    assert.ok(schema.options['font-size']);
    assert.ok(schema.options['background']);
    assert.ok(schema.options['keybind']);
  });

  test('getOptionInfo returns option details', () => {
    const schema = loadSchemaFromPath(schemaPath);
    const fontSizeInfo = getOptionInfo(schema, 'font-size');
    assert.ok(fontSizeInfo);
    assert.strictEqual(fontSizeInfo?.type, 'number');
  });

  test('getOptionInfo returns undefined for unknown keys', () => {
    const schema = loadSchemaFromPath(schemaPath);
    const info = getOptionInfo(schema, 'not-a-real-option');
    assert.strictEqual(info, undefined);
  });

  test('isRepeatableKey identifies repeatable keys', () => {
    const schema = loadSchemaFromPath(schemaPath);
    assert.strictEqual(isRepeatableKey(schema, 'keybind'), true);
    assert.strictEqual(isRepeatableKey(schema, 'palette'), true);
    assert.strictEqual(isRepeatableKey(schema, 'font-family'), true);
  });

  test('isRepeatableKey returns false for non-repeatable keys', () => {
    const schema = loadSchemaFromPath(schemaPath);
    assert.strictEqual(isRepeatableKey(schema, 'font-size'), false);
    assert.strictEqual(isRepeatableKey(schema, 'background'), false);
  });

  test('loadSchemaFromPath throws on a missing file', () => {
    assert.throws(() => loadSchemaFromPath('/nonexistent/schema.json'));
  });

  // loadSchema memoises into module state, so these share one test to stay
  // independent of the order mocha happens to run them in.
  test('loadSchema falls back without caching, then caches the real schema', async () => {
    // The fallback keeps the extension alive but reports every key as unknown,
    // so it must not stick around once a real schema is available.
    const fallback = await loadSchema({ extensionPath: '/nonexistent' });
    assert.strictEqual(fallback.version, '0.0.0');
    assert.deepStrictEqual(Object.keys(fallback.options), []);
    assert.strictEqual(getSchema(), null, 'the fallback must not be cached');

    const extensionPath = path.join(__dirname, '../../..');
    const first = await loadSchema({ extensionPath });
    assert.ok(Object.keys(first.options).length > 100);
    assert.strictEqual(getSchema(), first);

    const second = await loadSchema({ extensionPath });
    assert.strictEqual(first, second, 'expected the cached instance');
  });
});
