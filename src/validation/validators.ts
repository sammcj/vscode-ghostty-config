import { ConfigOption, GhosttySchema, ValidationResult } from '../types';
import { findKeybindSeparator } from '../parser/keybindParser';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/;
const HEX_COLOR_NO_HASH_REGEX = /^[0-9a-fA-F]{6}$/;

const NAMED_COLORS = new Set([
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'gray', 'grey', 'darkred', 'darkgreen', 'darkyellow', 'darkblue',
  'darkmagenta', 'darkcyan', 'lightgray', 'lightgrey', 'lightred',
  'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan',
  'orange', 'pink', 'purple', 'brown', 'gold', 'silver', 'navy', 'maroon',
  'olive', 'lime', 'aqua', 'teal', 'fuchsia', 'transparent',
  'cell-foreground', 'cell-background', 'background', 'extend', 'extend-always'
]);

const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', 'on', 'off']);

// Ghostty parses integer options with Zig's parseInt at base 0, which accepts
// 0x/0o/0b prefixes and _ digit separators.
const INTEGER_REGEX =
  /^[+-]?(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*|\d(?:_?\d)*)$/;
/** Base-10 integers only, as Zig's parseInt is called with an explicit base 10. */
const DECIMAL_INTEGER_REGEX = /^[+-]?\d(?:_?\d)*$/;

// Floats go through Zig's parseFloat, which also takes inf/nan and hex floats.
const DECIMAL_REGEX =
  /^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/;
const HEX_FLOAT_REGEX =
  /^[+-]?0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*(?:\.(?:[0-9a-fA-F](?:_?[0-9a-fA-F])*)?)?(?:[pP][+-]?\d(?:_?\d)*)?$/;
const NON_FINITE_REGEX = /^[+-]?(?:inf(?:inity)?|nan)$/i;

// Metrics.Modifier parses its bare form into an i32.
const I32_MIN = -2147483648n;
const I32_MAX = 2147483647n;

function isFloatShaped(value: string): boolean {
  return DECIMAL_REGEX.test(value) || HEX_FLOAT_REGEX.test(value) || NON_FINITE_REGEX.test(value);
}

/**
 * Resolves a value already matched by INTEGER_REGEX. BigInt reads the same
 * 0x/0o/0b prefixes as Zig, but not underscores or a leading plus.
 */
function integerValue(value: string): bigint | null {
  // BigInt rejects a sign in front of a radix prefix, so apply it separately.
  const unsigned = value.replace(/_/g, '').replace(/^[+-]/, '');
  try {
    const magnitude = BigInt(unsigned);
    return value.startsWith('-') ? -magnitude : magnitude;
  } catch {
    return null;
  }
}

/** Keeps a pathological value from filling the diagnostic. */
function forMessage(value: string): string {
  return value.length > 24 ? `${value.slice(0, 24)}...` : value;
}

/** Bounds are authored as whole numbers; anything else is not comparable. */
function boundAsBigInt(bound: number | string): bigint | null {
  try {
    return BigInt(bound);
  } catch {
    return null;
  }
}

/**
 * Resolves an already shape-checked value, or null when it has no finite
 * value to compare against a bound (inf/nan, or a hex float).
 */
function numericValue(value: string): number | null {
  const normalised = value.replace(/_/g, '');
  const negative = normalised.startsWith('-');
  const magnitude = Number(normalised.replace(/^[+-]/, ''));

  if (!Number.isFinite(magnitude)) {
    return null;
  }
  return negative ? -magnitude : magnitude;
}

export function validateValue(
  schema: GhosttySchema,
  key: string,
  value: string
): ValidationResult {
  const option = schema.options[key];

  if (!option) {
    return {
      isValid: false,
      message: `Unknown configuration key: '${key}'`,
      severity: 'warning',
    };
  }

  // Empty value resets to default - always valid
  if (value.trim() === '') {
    return { isValid: true };
  }

  switch (option.type) {
    case 'boolean':
      return validateBoolean(value);
    case 'number':
      return validateNumber(value, option);
    case 'color':
      return validateColor(value);
    case 'enum':
      return validateEnum(value, option);
    case 'keybind':
      return validateKeybind(value, schema);
    case 'path':
      return validatePath(value);
    case 'percentage':
      return validatePercentage(value);
    case 'duration':
      return validateDuration(value);
    case 'string':
    case 'theme':
    default:
      return { isValid: true };
  }
}

export function validateBoolean(value: string): ValidationResult {
  const normalised = value.toLowerCase();
  if (BOOLEAN_VALUES.has(normalised)) {
    return { isValid: true };
  }
  return {
    isValid: false,
    message: `Invalid boolean value: '${value}'. Expected one of: true, false, yes, no, on, off`,
    severity: 'error',
  };
}

export function validateNumber(value: string, option?: ConfigOption): ValidationResult {
  const literals = option?.allowedLiterals;
  if (literals?.includes(value)) {
    return { isValid: true };
  }

  const isInteger = option?.integer === true;
  // parseFloat/parseInt ignore trailing text, so '50MB' would otherwise pass.
  if (!(isInteger ? INTEGER_REGEX.test(value) : isFloatShaped(value))) {
    const kind = isInteger ? 'whole number' : 'number';
    const expected = literals?.length
      ? `. Expected a ${kind} or one of: ${literals.join(', ')}`
      : `. Expected a ${kind}`;
    return {
      isValid: false,
      message: `Invalid value: '${value}'${expected}`,
      severity: 'error',
    };
  }

  return checkBounds(value, option, isInteger);
}

/**
 * Integer options are compared as BigInt so that values beyond a double's
 * exact range, such as a u64 ceiling or an absurdly long digit string, are
 * still bounded correctly.
 */
function checkBounds(
  value: string,
  option: ConfigOption | undefined,
  isInteger: boolean
): ValidationResult {
  if (!option || (option.minimum === undefined && option.maximum === undefined)) {
    return { isValid: true };
  }

  const below = (min: number | string) =>
    ({
      isValid: false,
      message: `Value ${forMessage(value)} is below minimum ${min}`,
      severity: 'error',
    }) as const;
  const above = (max: number | string) =>
    ({
      isValid: false,
      message: `Value ${forMessage(value)} is above maximum ${max}`,
      severity: 'error',
    }) as const;

  if (isInteger) {
    const num = integerValue(value);
    if (num === null) {
      return { isValid: true };
    }

    const min = option.minimum !== undefined ? boundAsBigInt(option.minimum) : null;
    if (min !== null && num < min) {
      return below(option.minimum as number | string);
    }

    const max = option.maximum !== undefined ? boundAsBigInt(option.maximum) : null;
    if (max !== null && num > max) {
      return above(option.maximum as number | string);
    }
    return { isValid: true };
  }

  // inf/nan and hex floats have no finite value to bound, and Ghostty accepts
  // them, so there is nothing to report.
  const num = numericValue(value);
  if (num === null) {
    return { isValid: true };
  }
  if (option.minimum !== undefined && num < Number(option.minimum)) {
    return below(option.minimum);
  }
  if (option.maximum !== undefined && num > Number(option.maximum)) {
    return above(option.maximum);
  }
  return { isValid: true };
}

export function validateColor(value: string): ValidationResult {
  // Check hex formats
  if (HEX_COLOR_REGEX.test(value) || HEX_COLOR_NO_HASH_REGEX.test(value)) {
    return { isValid: true };
  }

  // Check named colours
  if (NAMED_COLORS.has(value.toLowerCase())) {
    return { isValid: true };
  }

  return {
    isValid: false,
    message: `Invalid colour: '${value}'. Expected hex (#RGB, #RRGGBB, #RRGGBBAA) or named colour`,
    severity: 'error',
  };
}

function validateEnum(value: string, option: ConfigOption): ValidationResult {
  if (!option.enum) {
    return { isValid: true };
  }

  if (option.flagSet) {
    return validateFlagSet(value, option.enum);
  }

  if (option.enum.includes(value)) {
    return { isValid: true };
  }

  return {
    isValid: false,
    message: `Invalid value: '${value}'. Expected one of: ${option.enum.join(', ')}`,
    severity: 'error',
  };
}

// Flag-set options (Ghostty packed structs) accept a comma-separated list of
// flags, each optionally prefixed with 'no-' to disable it, plus 'true'/'false'
// to toggle all flags at once. Example: 'no-bold,no-italic'.
function validateFlagSet(value: string, flags: string[]): ValidationResult {
  if (/^(true|false)$/i.test(value.trim())) {
    return { isValid: true };
  }

  const tokens = value.split(',').map((t) => t.trim()).filter((t) => t.length > 0);

  for (const token of tokens) {
    const base = token.startsWith('no-') ? token.slice(3) : token;
    if (!flags.includes(base)) {
      return {
        isValid: false,
        message: `Invalid flag: '${token}'. Expected a comma-separated list of: ${flags.join(', ')} (each optionally prefixed with 'no-'), or 'true'/'false'`,
        severity: 'error',
      };
    }
  }

  return { isValid: true };
}

function validateKeybind(value: string, schema: GhosttySchema): ValidationResult {
  // Special case: clear
  if (value === 'clear') {
    return { isValid: true };
  }

  // Basic format: [prefix:]trigger=action[:param]
  const equalsIndex = findKeybindSeparator(value);
  if (equalsIndex === -1) {
    return {
      isValid: false,
      message: `Invalid keybind format. Expected: [prefix:]trigger=action[:param]`,
      severity: 'error',
    };
  }

  const trigger = value.substring(0, equalsIndex);
  const actionPart = value.substring(equalsIndex + 1);

  // Validate trigger has content
  if (trigger.trim() === '') {
    return {
      isValid: false,
      message: `Keybind trigger cannot be empty`,
      severity: 'error',
    };
  }

  // Validate action has content
  const actionName = actionPart.split(':')[0];
  if (actionName.trim() === '') {
    return {
      isValid: false,
      message: `Keybind action cannot be empty`,
      severity: 'error',
    };
  }

  // Validate action is known (if we have actions in schema)
  const keybindType = schema.types['keybind'];
  if (keybindType?.actions && keybindType.actions.length > 0) {
    if (!keybindType.actions.includes(actionName)) {
      return {
        isValid: false,
        message: `Unknown keybind action: '${actionName}'`,
        severity: 'warning',
      };
    }
  }

  return { isValid: true };
}

function validatePath(value: string): ValidationResult {
  // Basic validation - paths should not be empty
  if (value.trim() === '') {
    return {
      isValid: false,
      message: `Path cannot be empty`,
      severity: 'error',
    };
  }

  // Allow ~ expansion, absolute paths, relative paths, and optional paths (?)
  if (value.startsWith('~') || value.startsWith('/') || value.startsWith('./') || value.startsWith('?')) {
    return { isValid: true };
  }

  // Also allow plain filenames
  return { isValid: true };
}

function validatePercentage(value: string): ValidationResult {
  // Ghostty's Metrics.Modifier reads a trailing % as a float delta, and any
  // other value as a base-10 integer.
  if (value.endsWith('%')) {
    if (isFloatShaped(value.slice(0, -1))) {
      return { isValid: true };
    }
  } else if (DECIMAL_INTEGER_REGEX.test(value)) {
    const num = integerValue(value);
    if (num !== null && (num < I32_MIN || num > I32_MAX)) {
      return {
        isValid: false,
        message: `Adjustment ${forMessage(value)} is outside the range ${I32_MIN} to ${I32_MAX}`,
        severity: 'error',
      };
    }
    return { isValid: true };
  }

  return {
    isValid: false,
    message: `Invalid adjustment: '${value}'. Expected a whole number, or a percentage such as '10%'`,
    severity: 'error',
  };
}

function validateDuration(value: string): ValidationResult {
  // Ghostty consumes <unsigned><unit> components in a loop, so '1h30m' is one
  // duration. Units must follow their number directly; ms/µs/us/ns come first
  // in the alternation so 'm' does not win against 'ms'.
  const durationRegex = /^(?:\d+(?:ms|µs|us|ns|y|w|d|h|m|s)\s*)+$/;

  // A bare number is only valid when it is zero, where the unit is unambiguous.
  if (value === '0' || durationRegex.test(value)) {
    return { isValid: true };
  }

  return {
    isValid: false,
    message: `Invalid duration: '${value}'. Expected a whole number with a unit (y, w, d, h, m, s, ms, us, ns), such as '500ms' or '1h30m'`,
    severity: 'error',
  };
}
