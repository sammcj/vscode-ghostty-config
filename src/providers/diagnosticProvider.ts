import * as vscode from 'vscode';
import { GhosttySchema, ParsedLine } from '../types';
import { parseDocument } from '../parser/configParser';
import { validateValue } from '../validation/validators';
import { isRepeatableKey } from '../schema/loader';

export class GhosttyDiagnosticProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    private schema: GhosttySchema
  ) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ghostty-config');
    context.subscriptions.push(this.diagnosticCollection);

    // Update diagnostics on document change
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.isGhosttyConfig(event.document)) {
          this.updateDiagnostics(event.document);
        }
      })
    );

    // Update diagnostics when document opens
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.isGhosttyConfig(document)) {
          this.updateDiagnostics(document);
        }
      })
    );

    // Clear diagnostics when document closes
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.diagnosticCollection.delete(document.uri);
      })
    );

    // Update diagnostics for all open documents
    vscode.workspace.textDocuments.forEach((document) => {
      if (this.isGhosttyConfig(document)) {
        this.updateDiagnostics(document);
      }
    });
  }

  private isGhosttyConfig(document: vscode.TextDocument): boolean {
    return document.languageId === 'ghostty-config';
  }

  private updateDiagnostics(document: vscode.TextDocument): void {
    const config = vscode.workspace.getConfiguration('ghostty-config');
    const enableDiagnostics = config.get<boolean>('enableDiagnostics', true);

    if (!enableDiagnostics) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const parsedLines = parseDocument(document.getText());

    // Validate individual lines
    for (const line of parsedLines) {
      diagnostics.push(...this.validateLine(line, document));
    }

    // Check for duplicates (respecting repeatable keys)
    diagnostics.push(...this.validateDuplicates(parsedLines, document));

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private validateLine(line: ParsedLine, _document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    if (line.type === 'invalid') {
      const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, line.raw.length);
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          'Invalid line format. Expected: key = value or # comment',
          vscode.DiagnosticSeverity.Error
        )
      );
      return diagnostics;
    }

    if (line.type !== 'keyValue' || !line.key) {
      return diagnostics;
    }

    const key = line.key;
    const value = line.value || '';
    const option = this.schema.options[key];

    // Unknown key warning
    if (!option) {
      const keyRange = line.keyRange
        ? new vscode.Range(line.lineNumber, line.keyRange.start, line.lineNumber, line.keyRange.end)
        : new vscode.Range(line.lineNumber, 0, line.lineNumber, line.raw.length);

      const severity = this.getDiagnosticSeverity();
      diagnostics.push(
        new vscode.Diagnostic(
          keyRange,
          `Unknown configuration key: '${key}'`,
          severity
        )
      );
      return diagnostics;
    }

    // Deprecated key hint
    if (option.deprecated) {
      const keyRange = line.keyRange
        ? new vscode.Range(line.lineNumber, line.keyRange.start, line.lineNumber, line.keyRange.end)
        : new vscode.Range(line.lineNumber, 0, line.lineNumber, line.raw.length);

      diagnostics.push(
        new vscode.Diagnostic(
          keyRange,
          `'${key}' is deprecated and may be removed in future versions`,
          vscode.DiagnosticSeverity.Hint
        )
      );
    }

    // Platform-specific hint
    if (option.platforms && option.platforms.length > 0) {
      const config = vscode.workspace.getConfiguration('ghostty-config');
      const showPlatformHints = config.get<boolean>('showPlatformHints', true);

      if (showPlatformHints) {
        const currentPlatform = this.getCurrentPlatform();
        if (currentPlatform && !option.platforms.includes(currentPlatform)) {
          const keyRange = line.keyRange
            ? new vscode.Range(line.lineNumber, line.keyRange.start, line.lineNumber, line.keyRange.end)
            : new vscode.Range(line.lineNumber, 0, line.lineNumber, line.raw.length);

          diagnostics.push(
            new vscode.Diagnostic(
              keyRange,
              `'${key}' is only available on ${option.platforms.join(', ')} (current: ${currentPlatform})`,
              vscode.DiagnosticSeverity.Information
            )
          );
        }
      }
    }

    // Value validation (skip empty values - they reset to default)
    if (value.trim() !== '') {
      const validation = validateValue(this.schema, key, value);
      if (!validation.isValid && validation.message) {
        const valueRange = line.valueRange
          ? new vscode.Range(line.lineNumber, line.valueRange.start, line.lineNumber, line.valueRange.end)
          : new vscode.Range(line.lineNumber, 0, line.lineNumber, line.raw.length);

        const severity = this.mapValidationSeverity(validation.severity);
        diagnostics.push(new vscode.Diagnostic(valueRange, validation.message, severity));
      }
    }

    return diagnostics;
  }

  private validateDuplicates(
    lines: ParsedLine[],
    _document: vscode.TextDocument
  ): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const keyOccurrences = new Map<string, number[]>();

    // Collect all key occurrences
    for (const line of lines) {
      if (line.type !== 'keyValue' || !line.key) {
        continue;
      }

      if (!keyOccurrences.has(line.key)) {
        keyOccurrences.set(line.key, []);
      }
      keyOccurrences.get(line.key)!.push(line.lineNumber);
    }

    // Check for duplicates (respecting repeatable keys)
    for (const [key, lineNumbers] of keyOccurrences) {
      if (lineNumbers.length <= 1) {
        continue;
      }

      // CRITICAL: Skip if this key is repeatable
      if (isRepeatableKey(this.schema, key)) {
        continue;
      }

      // Report duplicates for non-repeatable keys
      const firstLine = lineNumbers[0];
      for (let i = 1; i < lineNumbers.length; i++) {
        const lineNum = lineNumbers[i];
        const line = lines.find((l) => l.lineNumber === lineNum);
        if (!line || !line.keyRange) {
          continue;
        }

        const range = new vscode.Range(
          lineNum,
          line.keyRange.start,
          lineNum,
          line.keyRange.end
        );

        diagnostics.push(
          new vscode.Diagnostic(
            range,
            `Duplicate key '${key}' (first defined on line ${firstLine + 1})`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }

    return diagnostics;
  }

  private getCurrentPlatform(): 'macos' | 'linux' | null {
    if (process.platform === 'darwin') {
      return 'macos';
    }
    if (process.platform === 'linux') {
      return 'linux';
    }
    return null;
  }

  private getDiagnosticSeverity(): vscode.DiagnosticSeverity {
    const config = vscode.workspace.getConfiguration('ghostty-config');
    const severity = config.get<string>('diagnosticSeverity', 'Warning');

    switch (severity) {
      case 'Error':
        return vscode.DiagnosticSeverity.Error;
      case 'Warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'Information':
        return vscode.DiagnosticSeverity.Information;
      case 'Hint':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  private mapValidationSeverity(
    severity?: 'error' | 'warning' | 'info' | 'hint'
  ): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'error':
        return vscode.DiagnosticSeverity.Error;
      case 'warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'info':
        return vscode.DiagnosticSeverity.Information;
      case 'hint':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.diagnosticCollection.dispose();
  }
}
