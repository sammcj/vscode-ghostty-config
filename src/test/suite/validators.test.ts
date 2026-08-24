import * as assert from 'assert';
import {
  validateColor,
  validateBoolean,
  validateNumber,
  validateValue,
} from '../../validation/validators';
import { GhosttySchema } from '../../types';

const flagSchema: GhosttySchema = {
  version: 'test',
  description: 'test',
  types: {},
  repeatableKeys: [],
  options: {
    'font-synthetic-style': {
      type: 'enum',
      description: '',
      flagSet: true,
      enum: ['bold', 'italic', 'bold-italic'],
    },
    'cursor-style': {
      type: 'enum',
      description: '',
      enum: ['block', 'bar', 'underline', 'block_hollow'],
    },
  },
};

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

  suite('flag-set enum validation', () => {
    const check = (value: string) =>
      validateValue(flagSchema, 'font-synthetic-style', value).isValid;

    test('accepts a single flag', () => {
      assert.strictEqual(check('bold'), true);
      assert.strictEqual(check('bold-italic'), true);
    });

    test('accepts a no- prefixed flag', () => {
      assert.strictEqual(check('no-bold'), true);
    });

    test('accepts a comma-separated list of flags', () => {
      assert.strictEqual(check('no-bold,no-italic'), true);
      assert.strictEqual(check('bold, italic'), true);
    });

    test('accepts true/false to toggle all', () => {
      assert.strictEqual(check('true'), true);
      assert.strictEqual(check('false'), true);
    });

    test('rejects an unknown flag', () => {
      assert.strictEqual(check('wiggle'), false);
      assert.strictEqual(check('no-underline'), false);
      assert.strictEqual(check('bold,nope'), false);
    });
  });

  suite('plain enum validation', () => {
    const check = (value: string) =>
      validateValue(flagSchema, 'cursor-style', value).isValid;

    test('accepts a known value', () => {
      assert.strictEqual(check('block'), true);
      assert.strictEqual(check('block_hollow'), true);
    });

    test('rejects an unknown value', () => {
      assert.strictEqual(check('triangle'), false);
    });

    test('does not split plain enums on commas', () => {
      assert.strictEqual(check('block,bar'), false);
    });
  });
});
