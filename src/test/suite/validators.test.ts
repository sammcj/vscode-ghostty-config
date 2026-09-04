import * as assert from 'assert';
import * as path from 'path';
import { loadSchemaFromPath } from '../../schema/loader';
import {
  validateColor,
  validateBoolean,
  validateNumber,
  validateValue,
} from '../../validation/validators';
import { ConfigOption, GhosttySchema } from '../../types';

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

const keybindSchema: GhosttySchema = {
  version: 'test',
  description: 'test',
  types: {
    keybind: {
      description: '',
      actions: ['equalize_splits', 'text'],
    },
  },
  repeatableKeys: ['keybind'],
  options: {
    keybind: {
      type: 'keybind',
      description: '',
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

    test('accepts allowed literals such as unlimited', () => {
      const option: ConfigOption = {
        type: 'number',
        description: '',
        minimum: 0,
        allowedLiterals: ['unlimited'],
      };
      assert.strictEqual(validateNumber('unlimited', option).isValid, true);
      assert.strictEqual(validateNumber('50000000', option).isValid, true);

      const bad = validateNumber('boundless', option);
      assert.strictEqual(bad.isValid, false);
      assert.ok(bad.message?.includes('unlimited'));
    });

    test('rejects fractions and unit suffixes for integer options', () => {
      const option: ConfigOption = {
        type: 'number',
        description: '',
        minimum: 0,
        integer: true,
        allowedLiterals: ['unlimited'],
      };
      assert.strictEqual(validateNumber('50000000', option).isValid, true);
      assert.strictEqual(validateNumber('unlimited', option).isValid, true);
      assert.strictEqual(validateNumber('50MB', option).isValid, false);
      assert.strictEqual(validateNumber('1.5', option).isValid, false);
    });

    test('accepts the base-0 integer forms Ghostty parses', () => {
      const option: ConfigOption = { type: 'number', description: '', integer: true };
      assert.strictEqual(validateNumber('0x4000000', option).isValid, true);
      assert.strictEqual(validateNumber('0o17', option).isValid, true);
      assert.strictEqual(validateNumber('0b1010', option).isValid, true);
      assert.strictEqual(validateNumber('50_000_000', option).isValid, true);
      assert.strictEqual(validateNumber('0xZZ', option).isValid, false);
    });

    test('range checks understand base-0 forms', () => {
      const option: ConfigOption = {
        type: 'number',
        description: '',
        integer: true,
        minimum: 100,
      };
      // parseFloat would read 0x1F as 0 and wrongly report it below minimum.
      assert.strictEqual(validateNumber('0x1F', option).isValid, false);
      assert.strictEqual(validateNumber('0xFF', option).isValid, true);
      assert.strictEqual(validateNumber('1_000', option).isValid, true);
    });

    test('enforces minimum and maximum', () => {
      const option: ConfigOption = { type: 'number', description: '', minimum: 1, maximum: 10 };
      assert.strictEqual(validateNumber('5', option).isValid, true);
      assert.strictEqual(validateNumber('0', option).isValid, false);

      const tooBig = validateNumber('11', option);
      assert.strictEqual(tooBig.isValid, false);
      assert.ok(tooBig.message?.includes('above maximum 10'));
    });

    test('accepts the float forms Zig parseFloat takes', () => {
      const option: ConfigOption = { type: 'number', description: '' };
      assert.strictEqual(validateNumber('inf', option).isValid, true);
      assert.strictEqual(validateNumber('-Infinity', option).isValid, true);
      assert.strictEqual(validateNumber('nan', option).isValid, true);
      assert.strictEqual(validateNumber('0x1p0', option).isValid, true);
      assert.strictEqual(validateNumber('1e1_0', option).isValid, true);
    });

    test('skips range checks only for inf and nan', () => {
      // Ghostty accepts these, so flagging them against a bound would be a
      // false positive. Everything else must still be bounded.
      const option: ConfigOption = { type: 'number', description: '', minimum: 0, maximum: 1 };
      assert.strictEqual(validateNumber('inf', option).isValid, true);
      assert.strictEqual(validateNumber('nan', option).isValid, true);
      assert.strictEqual(validateNumber('2', option).isValid, false);
      // Overflows a double, so it resolves to Infinity and exceeds the bound.
      assert.strictEqual(validateNumber('1e400', option).isValid, false);
    });

    test('bounds hex floats by their decoded value', () => {
      const option: ConfigOption = { type: 'number', description: '', minimum: 0, maximum: 1 };
      assert.strictEqual(validateNumber('0x1p0', option).isValid, true); // 1
      assert.strictEqual(validateNumber('0x0.8p0', option).isValid, true); // 0.5
      assert.strictEqual(validateNumber('0x2p0', option).isValid, false); // 2
      assert.strictEqual(validateNumber('0x1.8p1', option).isValid, false); // 3
      assert.strictEqual(validateNumber('-0x1p0', option).isValid, false); // -1
    });

    test('rejects trailing text on non-integer options', () => {
      const option: ConfigOption = { type: 'number', description: '' };
      assert.strictEqual(validateNumber('1.5', option).isValid, true);
      assert.strictEqual(validateNumber('1e3', option).isValid, true);
      assert.strictEqual(validateNumber('.5', option).isValid, true);
      assert.strictEqual(validateNumber('12pt', option).isValid, false);
      assert.strictEqual(validateNumber('0.9abc', option).isValid, false);
    });
  });

  // The loader casts parsed JSON with `as GhosttySchema` and does no runtime
  // checking, so a typo in the schema would only show up here.
  suite('real schema', () => {
    const schema = loadSchemaFromPath(
      path.join(__dirname, '../../../schema/ghostty-config-syntax.schema.json')
    );
    const check = (key: string, value: string) => validateValue(schema, key, value);

    test('accepts unlimited on the Limit-typed options', () => {
      assert.strictEqual(check('scrollback-limit-bytes', 'unlimited').isValid, true);
      assert.strictEqual(check('scrollback-limit-lines', 'unlimited').isValid, true);
      assert.strictEqual(check('clipboard-write-limit-bytes', 'unlimited').isValid, true);
      assert.strictEqual(check('scrollback-limit', 'unlimited').isValid, true);
    });

    test('rejects sizes and fractions on integer options', () => {
      assert.strictEqual(check('scrollback-limit-bytes', '50MB').isValid, false);
      assert.strictEqual(check('scrollback-limit-lines', '1.5').isValid, false);
      assert.strictEqual(check('window-width', '80.5').isValid, false);
    });

    test('still accepts fractions on float options', () => {
      assert.strictEqual(check('font-size', '13.5').isValid, true);
      assert.strictEqual(check('background-opacity', '0.9').isValid, true);
    });

    test('bounds integer options by their Ghostty type', () => {
      assert.strictEqual(check('window-position-x', '-32768').isValid, true);
      assert.strictEqual(check('window-position-x', '-32769').isValid, false);
      assert.strictEqual(check('window-position-x', '32768').isValid, false);

      assert.strictEqual(check('abnormal-command-exit-runtime', '4294967295').isValid, true);
      assert.strictEqual(check('abnormal-command-exit-runtime', '4294967296').isValid, false);

      // u32 and usize options are unsigned, so a negative is out of range.
      assert.strictEqual(check('click-repeat-interval', '-1').isValid, false);
      assert.strictEqual(check('linux-cgroup-memory-limit', '-1').isValid, false);
      assert.strictEqual(check('font-thicken-strength', '256').isValid, false);
    });

    test('bounds u64 options exactly, past what a double holds', () => {
      const max = '18446744073709551615';
      assert.strictEqual(check('scrollback-limit-bytes', max).isValid, true);
      // 2^64 rounds to the same double as the ceiling above, so only an exact
      // comparison catches it.
      assert.strictEqual(check('scrollback-limit-bytes', '18446744073709551616').isValid, false);
      // Long enough to become Infinity, which previously skipped bounds.
      assert.strictEqual(check('scrollback-limit-bytes', '9'.repeat(400)).isValid, false);
    });

    test('accepts the refreshed enum values', () => {
      assert.strictEqual(check('copy-on-select', 'both').isValid, true);
      assert.strictEqual(check('middle-click-action', 'clipboard-paste').isValid, true);
      assert.strictEqual(check('drag-handle', 'never').isValid, true);
      assert.strictEqual(check('keybind', 'ctrl+t=set_window_title').isValid, true);
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

  suite('keybind validation', () => {
    const check = (value: string) =>
      validateValue(keybindSchema, 'keybind', value);

    test('accepts a literal equals key in the trigger', () => {
      assert.strictEqual(check('super+shift+==equalize_splits').isValid, true);
    });

    test('keeps equals signs in action parameters', () => {
      assert.strictEqual(check('ctrl+a=text:foo=bar').isValid, true);
    });

    test('still rejects unknown actions', () => {
      const result = check('ctrl+a=not_an_action');
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.message, "Unknown keybind action: 'not_an_action'");
    });

    test('rejects a keybind with no action separator', () => {
      const result = check('ctrl+a');
      assert.strictEqual(result.isValid, false);
      assert.ok(result.message?.includes('Invalid keybind format'));
    });

    test('rejects an empty trigger or action', () => {
      assert.strictEqual(check('=copy_to_clipboard').message, 'Keybind trigger cannot be empty');
      assert.strictEqual(check('ctrl+a=').message, 'Keybind action cannot be empty');
    });

    test('accepts the clear directive and prefixed binds', () => {
      assert.strictEqual(check('clear').isValid, true);
      assert.strictEqual(check('global:ctrl+a=text').isValid, true);
    });
  });

  // Ghostty parses these in a loop of <unsigned><unit> components, so the
  // shape is stricter and more permissive than a single number plus a suffix.
  suite('duration validation', () => {
    const schema: GhosttySchema = {
      version: 'test',
      description: 'test',
      types: {},
      repeatableKeys: [],
      options: { 'undo-timeout': { type: 'duration', description: '' } },
    };
    const check = (value: string) => validateValue(schema, 'undo-timeout', value);

    test('accepts a single component', () => {
      assert.strictEqual(check('500ms').isValid, true);
      assert.strictEqual(check('5s').isValid, true);
      assert.strictEqual(check('2w').isValid, true);
      assert.strictEqual(check('1ns').isValid, true);
      assert.strictEqual(check('3µs').isValid, true);
    });

    test('accepts compound durations', () => {
      assert.strictEqual(check('1h30m').isValid, true);
      assert.strictEqual(check('1d12h30m15s').isValid, true);
      assert.strictEqual(check('1m 30s').isValid, true);
    });

    test('distinguishes m from ms', () => {
      assert.strictEqual(check('5m').isValid, true);
      assert.strictEqual(check('5ms').isValid, true);
    });

    test('accepts a bare zero only', () => {
      assert.strictEqual(check('0').isValid, true);
      assert.strictEqual(check('500').isValid, false);
    });

    test('rejects negatives, fractions and unknown units', () => {
      assert.strictEqual(check('-5s').isValid, false);
      assert.strictEqual(check('1.5s').isValid, false);
      assert.strictEqual(check('5years').isValid, false);
      assert.strictEqual(check('1 h').isValid, false);
      assert.strictEqual(check('abc').isValid, false);
    });
  });

  suite('percentage validation', () => {
    const schema: GhosttySchema = {
      version: 'test',
      description: 'test',
      types: {},
      repeatableKeys: [],
      options: { 'adjust-cell-width': { type: 'percentage', description: '' } },
    };
    const check = (value: string) => validateValue(schema, 'adjust-cell-width', value);

    test('accepts whole numbers and percentages', () => {
      assert.strictEqual(check('1').isValid, true);
      assert.strictEqual(check('-2').isValid, true);
      assert.strictEqual(check('10%').isValid, true);
      assert.strictEqual(check('-12.5%').isValid, true);
    });

    test('rejects fractions without a percent sign', () => {
      // Metrics.Modifier parses the bare form with parseInt, not parseFloat.
      assert.strictEqual(check('1.5').isValid, false);
    });

    test('rejects trailing text', () => {
      assert.strictEqual(check('10px').isValid, false);
      assert.strictEqual(check('abc').isValid, false);
      assert.strictEqual(check('%').isValid, false);
    });

    test('enforces the i32 range on the bare form', () => {
      assert.strictEqual(check('2147483647').isValid, true);
      assert.strictEqual(check('-2147483648').isValid, true);
      assert.strictEqual(check('2147483648').isValid, false);
      assert.strictEqual(check('-2147483649').isValid, false);
      assert.strictEqual(check('9'.repeat(400)).isValid, false);
    });

    test('accepts digit separators and hex prefixes only where Ghostty does', () => {
      // Metrics.Modifier parses the bare form at base 10, so 0x is not a number.
      assert.strictEqual(check('1_000').isValid, true);
      assert.strictEqual(check('0x10').isValid, false);
    });
  });
});
