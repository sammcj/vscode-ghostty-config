import * as assert from 'assert';
import { parseDocument } from '../../parser/configParser';

suite('Config Parser', () => {
  test('parses simple key-value pairs', () => {
    const result = parseDocument('font-size = 14');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].key, 'font-size');
    assert.strictEqual(result[0].value, '14');
  });

  test('parses key-value without spaces', () => {
    const result = parseDocument('font-size=14');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].key, 'font-size');
    assert.strictEqual(result[0].value, '14');
  });

  test('ignores comment lines', () => {
    const result = parseDocument('# This is a comment\nfont-size = 14');
    const keyValues = result.filter(r => r.type === 'keyValue');
    assert.strictEqual(keyValues.length, 1);
    assert.strictEqual(keyValues[0].key, 'font-size');
  });

  test('ignores empty lines', () => {
    const result = parseDocument('font-size = 14\n\nbackground = #000000');
    const keyValues = result.filter(r => r.type === 'keyValue');
    assert.strictEqual(keyValues.length, 2);
  });

  test('handles values with equals sign', () => {
    const result = parseDocument('keybind = ctrl+a=select_all');
    const keyValues = result.filter(r => r.type === 'keyValue');
    assert.strictEqual(keyValues.length, 1);
    assert.strictEqual(keyValues[0].key, 'keybind');
    assert.strictEqual(keyValues[0].value, 'ctrl+a=select_all');
  });

  test('tracks line numbers correctly', () => {
    const result = parseDocument('# comment\nfont-size = 14\n\nbackground = #000');
    const keyValues = result.filter(r => r.type === 'keyValue');
    assert.strictEqual(keyValues[0].lineNumber, 1);
    assert.strictEqual(keyValues[1].lineNumber, 3);
  });

  test('parses multiple keybinds', () => {
    const config = `keybind = ctrl+c=copy_to_clipboard
keybind = ctrl+v=paste_from_clipboard
keybind = ctrl+t=new_tab`;
    const result = parseDocument(config);
    const keyValues = result.filter(r => r.type === 'keyValue');
    assert.strictEqual(keyValues.length, 3);
    assert.ok(keyValues.every(r => r.key === 'keybind'));
  });
});
