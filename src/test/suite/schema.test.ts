import * as assert from 'assert';
import * as path from 'path';
import { loadSchemaFromPath, getOptionInfo, isRepeatableKey } from '../../schema/loader';

const schemaPath = path.join(__dirname, '../../../schema/ghostty-config.schema.json');

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
});
