export interface GhosttySchema {
  version: string;
  description: string;
  options: Record<string, ConfigOption>;
  types: Record<string, TypeDefinition>;
  repeatableKeys: string[];
}

export interface ConfigOption {
  type: ConfigValueType;
  description: string;
  repeatable?: boolean;
  deprecated?: boolean;
  enum?: string[];
  examples?: string[];
  platforms?: Platform[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  default?: string;
}

export type ConfigValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'color'
  | 'enum'
  | 'keybind'
  | 'path'
  | 'percentage'
  | 'duration'
  | 'theme';

export type Platform = 'macos' | 'linux';

export interface TypeDefinition {
  description: string;
  patterns?: string[];
  validValues?: string[];
  namedValues?: string[];
  prefixes?: string[];
  modifiers?: string[];
  actions?: string[];
}

export interface ParsedLine {
  type: 'comment' | 'keyValue' | 'empty' | 'invalid';
  lineNumber: number;
  key?: string;
  value?: string;
  keyRange?: Range;
  valueRange?: Range;
  raw: string;
}

export interface Range {
  start: number;
  end: number;
}

export interface ValidationResult {
  isValid: boolean;
  message?: string;
  severity?: 'error' | 'warning' | 'info' | 'hint';
}
