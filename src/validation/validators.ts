import { ConfigOption, GhosttySchema, ValidationResult } from '../types';

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
  const num = parseFloat(value);
  if (isNaN(num)) {
    return {
      isValid: false,
      message: `Invalid number: '${value}'`,
      severity: 'error',
    };
  }

  if (option) {
    if (option.minimum !== undefined && num < option.minimum) {
      return {
        isValid: false,
        message: `Value ${num} is below minimum ${option.minimum}`,
        severity: 'error',
      };
    }

    if (option.maximum !== undefined && num > option.maximum) {
      return {
        isValid: false,
        message: `Value ${num} is above maximum ${option.maximum}`,
        severity: 'error',
      };
    }
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

  if (option.enum.includes(value)) {
    return { isValid: true };
  }

  return {
    isValid: false,
    message: `Invalid value: '${value}'. Expected one of: ${option.enum.join(', ')}`,
    severity: 'error',
  };
}

function validateKeybind(value: string, schema: GhosttySchema): ValidationResult {
  // Special case: clear
  if (value === 'clear') {
    return { isValid: true };
  }

  // Basic format: [prefix:]trigger=action[:param]
  const equalsIndex = value.indexOf('=');
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
  // Can be a number or number with %
  const cleanValue = value.endsWith('%') ? value.slice(0, -1) : value;
  const num = parseFloat(cleanValue);

  if (isNaN(num)) {
    return {
      isValid: false,
      message: `Invalid percentage/number: '${value}'`,
      severity: 'error',
    };
  }

  return { isValid: true };
}

function validateDuration(value: string): ValidationResult {
  // Duration format: number with optional unit (y, d, h, m, s, ms, us, µs, ns)
  const durationRegex = /^-?\d+(\.\d+)?(y|d|h|m|s|ms|us|µs|ns)?$/;
  if (durationRegex.test(value)) {
    return { isValid: true };
  }

  return {
    isValid: false,
    message: `Invalid duration: '${value}'. Expected number with optional unit (s, ms, etc.)`,
    severity: 'error',
  };
}
