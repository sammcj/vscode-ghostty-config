import * as vscode from 'vscode';
import { GhosttyCompletionProvider } from './providers/completionProvider';
import { GhosttyHoverProvider } from './providers/hoverProvider';
import { GhosttyDiagnosticProvider } from './providers/diagnosticProvider';
import { loadSchema } from './schema/loader';
import { registerOpenConfigCommand } from './commands/openConfig';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const schema = await loadSchema(context);

  const selector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'ghostty-config' },
    { scheme: 'untitled', language: 'ghostty-config' },
  ];

  // Register completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      new GhosttyCompletionProvider(schema),
      '=',
      ' '
    )
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new GhosttyHoverProvider(schema))
  );

  // Register diagnostic provider
  const diagnosticProvider = new GhosttyDiagnosticProvider(context, schema);
  context.subscriptions.push(diagnosticProvider);

  // Register commands
  context.subscriptions.push(registerOpenConfigCommand());
}

export function deactivate(): void {
  // Cleanup if needed
}
