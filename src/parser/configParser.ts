import { ParsedLine, Range } from '../types';

const KEY_VALUE_REGEX = /^(\s*)([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(.*?)\s*$/;
const COMMENT_REGEX = /^\s*#/;

export function parseDocument(text: string): ParsedLine[] {
  const lines = text.split('\n');
  const result: ParsedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    result.push(parseLine(lines[i], i));
  }

  return result;
}

export function parseLine(line: string, lineNumber: number): ParsedLine {
  // Empty line
  if (line.trim() === '') {
    return {
      type: 'empty',
      lineNumber,
      raw: line,
    };
  }

  // Comment line
  if (COMMENT_REGEX.test(line)) {
    return {
      type: 'comment',
      lineNumber,
      raw: line,
    };
  }

  // Key-value pair
  const match = KEY_VALUE_REGEX.exec(line);
  if (match) {
    const [, indent, key, value] = match;
    const keyStart = indent.length;
    const keyEnd = keyStart + key.length;

    // Find value range (after =)
    const equalsIndex = line.indexOf('=');
    const valueStart = equalsIndex + 1 + (line.substring(equalsIndex + 1).length - line.substring(equalsIndex + 1).trimStart().length);
    const valueEnd = line.trimEnd().length;

    const keyRange: Range = { start: keyStart, end: keyEnd };
    const valueRange: Range = { start: valueStart, end: valueEnd };

    return {
      type: 'keyValue',
      lineNumber,
      key,
      value: value.trim(),
      keyRange,
      valueRange,
      raw: line,
    };
  }

  // Invalid line (has content but doesn't match expected format)
  return {
    type: 'invalid',
    lineNumber,
    raw: line,
  };
}

export function getKeyAtPosition(
  document: { lineAt: (line: number) => { text: string } },
  position: { line: number; character: number }
): string | undefined {
  const line = document.lineAt(position.line).text;
  const parsed = parseLine(line, position.line);

  if (parsed.type !== 'keyValue' || !parsed.keyRange) {
    return undefined;
  }

  // Check if position is within the key range
  if (position.character >= parsed.keyRange.start && position.character <= parsed.keyRange.end) {
    return parsed.key;
  }

  return undefined;
}

export function getValueAtPosition(
  document: { lineAt: (line: number) => { text: string } },
  position: { line: number; character: number }
): { key: string; value: string } | undefined {
  const line = document.lineAt(position.line).text;
  const parsed = parseLine(line, position.line);

  if (parsed.type !== 'keyValue' || !parsed.valueRange || !parsed.key) {
    return undefined;
  }

  // Check if position is within the value range
  if (position.character >= parsed.valueRange.start && position.character <= parsed.valueRange.end) {
    return { key: parsed.key, value: parsed.value || '' };
  }

  return undefined;
}

export function isInKeyPosition(line: string, character: number): boolean {
  const equalsIndex = line.indexOf('=');
  // Before = or no = present
  return equalsIndex === -1 || character <= equalsIndex;
}

export function isInValuePosition(line: string, character: number): boolean {
  const equalsIndex = line.indexOf('=');
  // After = and = is present
  return equalsIndex !== -1 && character > equalsIndex;
}
