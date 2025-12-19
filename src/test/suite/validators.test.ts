import * as assert from 'assert';
import {
  validateColor,
  validateBoolean,
  validateNumber,
} from '../../validation/validators';

suite('Validators', () => {
  suite('validateColor', () => {
    test('accepts 6-digit hex colours', () => {
      assert.strictEqual(validateColor('#ff0000').isValid, true);
      assert.strictEqual(validateColor('#AABBCC').isValid, true);
    });

    test('accepts 8-digit hex colours with alpha', () => {
      assert.strictEqual(validateColor('#ff0000ff').isValid, true);
    });

    test('accepts 3-digit shorthand hex', () => {
      assert.strictEqual(validateColor('#f00').isValid, true);
    });

    test('rejects invalid hex colours', () => {
      assert.strictEqual(validateColor('#gg0000').isValid, false);
      assert.strictEqual(validateColor('ff0000').isValid, true); // 6-digit without # is valid
      assert.strictEqual(validateColor('#ff00').isValid, false);
    });

    test('accepts named colours', () => {
      assert.strictEqual(validateColor('black').isValid, true);
      assert.strictEqual(validateColor('red').isValid, true);
      assert.strictEqual(validateColor('transparent').isValid, true);
    });
  });

  suite('validateBoolean', () => {
    test('accepts true/false', () => {
      assert.strictEqual(validateBoolean('true').isValid, true);
      assert.strictEqual(validateBoolean('false').isValid, true);
    });

    test('accepts yes/no', () => {
      assert.strictEqual(validateBoolean('yes').isValid, true);
      assert.strictEqual(validateBoolean('no').isValid, true);
    });

    test('accepts on/off', () => {
      assert.strictEqual(validateBoolean('on').isValid, true);
      assert.strictEqual(validateBoolean('off').isValid, true);
    });

    test('rejects invalid booleans', () => {
      assert.strictEqual(validateBoolean('1').isValid, false);
      assert.strictEqual(validateBoolean('enabled').isValid, false);
    });
  });

  suite('validateNumber', () => {
    test('accepts integers', () => {
      assert.strictEqual(validateNumber('42').isValid, true);
      assert.strictEqual(validateNumber('-10').isValid, true);
      assert.strictEqual(validateNumber('0').isValid, true);
    });

    test('accepts floats', () => {
      assert.strictEqual(validateNumber('1.5').isValid, true);
      assert.strictEqual(validateNumber('0.75').isValid, true);
    });

    test('rejects non-numbers', () => {
      assert.strictEqual(validateNumber('abc').isValid, false);
    });
  });
});
