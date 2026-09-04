import * as assert from 'assert';
import {
  parseDocument,
  getKeyAtPosition,
  getValueAtPosition,
  isInKeyPosition,
  isInValuePosition,
} from '../../parser/configParser';

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

  test('marks lines without a separator as invalid', () => {
    const result = parseDocument('font-size');
    assert.strictEqual(result[0].type, 'invalid');
    assert.strictEqual(result[0].raw, 'font-size');
  });
});

// These drive which completions the extension offers, and hover lookups.
suite('Cursor position helpers', () => {
  const document = (text: string) => ({ lineAt: () => ({ text }) });

  suite('isInKeyPosition / isInValuePosition', () => {
    test('splits on the first equals sign', () => {
      const line = 'font-size = 14';
      assert.strictEqual(isInKeyPosition(line, 4), true);
      assert.strictEqual(isInValuePosition(line, 4), false);
      assert.strictEqual(isInValuePosition(line, 13), true);
      assert.strictEqual(isInKeyPosition(line, 13), false);
    });

    test('treats a line with no equals sign as a key', () => {
      assert.strictEqual(isInKeyPosition('font-si', 7), true);
      assert.strictEqual(isInValuePosition('font-si', 7), false);
    });

    test('treats the equals sign itself as the key position', () => {
      const line = 'font-size=14';
      assert.strictEqual(isInKeyPosition(line, 9), true);
      assert.strictEqual(isInValuePosition(line, 9), false);
      assert.strictEqual(isInValuePosition(line, 10), true);
    });
  });

  suite('getKeyAtPosition', () => {
    test('returns the key when the cursor is on it', () => {
      assert.strictEqual(getKeyAtPosition(document('font-size = 14'), { line: 0, character: 3 }), 'font-size');
    });

    test('returns undefined when the cursor is on the value', () => {
      assert.strictEqual(getKeyAtPosition(document('font-size = 14'), { line: 0, character: 13 }), undefined);
    });

    test('returns undefined on comments and invalid lines', () => {
      assert.strictEqual(getKeyAtPosition(document('# a comment'), { line: 0, character: 3 }), undefined);
      assert.strictEqual(getKeyAtPosition(document('font-size'), { line: 0, character: 3 }), undefined);
    });
  });

  suite('getValueAtPosition', () => {
    test('returns the key and value when the cursor is on the value', () => {
      assert.deepStrictEqual(
        getValueAtPosition(document('font-size = 14'), { line: 0, character: 13 }),
        { key: 'font-size', value: '14' }
      );
    });

    test('returns undefined when the cursor is on the key', () => {
      assert.strictEqual(getValueAtPosition(document('font-size = 14'), { line: 0, character: 3 }), undefined);
    });

    test('handles keybind values containing equals signs', () => {
      assert.deepStrictEqual(
        getValueAtPosition(document('keybind = super+shift+==equalize_splits'), { line: 0, character: 30 }),
        { key: 'keybind', value: 'super+shift+==equalize_splits' }
      );
    });
  });
});
