import * as vscode from 'vscode';
import { GhosttySchema, ConfigOption } from '../types';
import { parseLine, isInKeyPosition, isInValuePosition } from '../parser/configParser';

export class GhosttyCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private schema: GhosttySchema) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const line = document.lineAt(position.line).text;
    const textBeforeCursor = line.substring(0, position.character);

    // Skip comments
    if (textBeforeCursor.trim().startsWith('#')) {
      return [];
    }

    // Determine if we're completing a key or value
    if (isInKeyPosition(line, position.character)) {
      return this.getKeyCompletions(textBeforeCursor);
    }

    if (isInValuePosition(line, position.character)) {
      const parsed = parseLine(line, position.line);
      if (parsed.key) {
        return this.getValueCompletions(parsed.key, textBeforeCursor);
      }
    }

    return [];
  }

  private getKeyCompletions(textBeforeCursor: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    const prefix = textBeforeCursor.trim().toLowerCase();

    for (const [key, option] of Object.entries(this.schema.options)) {
      if (prefix && !key.toLowerCase().includes(prefix)) {
        continue;
      }

      const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
      item.detail = this.getTypeLabel(option);
      item.documentation = this.buildKeyDocumentation(key, option);
      item.insertText = `${key} = `;
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: 'Trigger value suggestions',
      };

      // Deprecated keys have lower priority
      if (option.deprecated) {
        item.tags = [vscode.CompletionItemTag.Deprecated];
        item.sortText = `z_${key}`; // Sort at the end
      } else {
        item.sortText = key;
      }

      items.push(item);
    }

    return items;
  }

  private getValueCompletions(key: string, textBeforeCursor: string): vscode.CompletionItem[] {
    const option = this.schema.options[key];
    if (!option) {
      return [];
    }

    // Extract partial value after =
    const equalsIndex = textBeforeCursor.indexOf('=');
    const partialValue = equalsIndex !== -1
      ? textBeforeCursor.substring(equalsIndex + 1).trim().toLowerCase()
      : '';

    switch (option.type) {
      case 'boolean':
        return this.getBooleanCompletions(partialValue);
      case 'color':
        return this.getColorCompletions(partialValue);
      case 'enum':
        return this.getEnumCompletions(option, partialValue);
      case 'keybind':
        return this.getKeybindCompletions(partialValue);
      case 'theme':
        return this.getThemeCompletions(partialValue);
      default:
        return this.getExampleCompletions(option, partialValue);
    }
  }

  private getBooleanCompletions(partial: string): vscode.CompletionItem[] {
    const values = ['true', 'false'];
    return values
      .filter(v => !partial || v.startsWith(partial))
      .map(v => {
        const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Value);
        item.detail = 'Boolean';
        return item;
      });
  }

  private getColorCompletions(partial: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Common hex templates
    const hexTemplates = [
      { label: '#RRGGBB', insertText: '#', detail: 'Hex colour (e.g. #ff0000)' },
    ];

    // Named colours
    const namedColors = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'transparent', 'cell-foreground', 'cell-background',
    ];

    for (const template of hexTemplates) {
      if (!partial || template.label.toLowerCase().includes(partial) || template.insertText.startsWith(partial)) {
        const item = new vscode.CompletionItem(template.label, vscode.CompletionItemKind.Color);
        item.insertText = template.insertText;
        item.detail = template.detail;
        items.push(item);
      }
    }

    for (const color of namedColors) {
      if (!partial || color.includes(partial)) {
        const item = new vscode.CompletionItem(color, vscode.CompletionItemKind.Color);
        item.detail = 'Named colour';
        items.push(item);
      }
    }

    return items;
  }

  private getEnumCompletions(option: ConfigOption, partial: string): vscode.CompletionItem[] {
    if (!option.enum) {
      return [];
    }

    return option.enum
      .filter(v => !partial || v.toLowerCase().includes(partial))
      .map(v => {
        const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember);
        item.detail = option.type;
        return item;
      });
  }

  private getKeybindCompletions(partial: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    const keybindType = this.schema.types['keybind'];

    // Check if partial already has trigger (contains =)
    if (partial.includes('=')) {
      // Suggest actions
      if (keybindType?.actions) {
        const actionPrefix = partial.split('=')[1]?.toLowerCase() || '';
        for (const action of keybindType.actions) {
          if (!actionPrefix || action.toLowerCase().includes(actionPrefix)) {
            const item = new vscode.CompletionItem(action, vscode.CompletionItemKind.Function);
            item.detail = 'Keybind action';
            items.push(item);
          }
        }
      }
    } else {
      // Suggest common keybind patterns
      const commonPatterns = [
        { label: 'ctrl+', detail: 'Control modifier' },
        { label: 'shift+', detail: 'Shift modifier' },
        { label: 'alt+', detail: 'Alt/Option modifier' },
        { label: 'super+', detail: 'Super/Command modifier' },
        { label: 'cmd+', detail: 'Command modifier (macOS)' },
        { label: 'global:', detail: 'Global prefix (works when unfocused)' },
        { label: 'performable:', detail: 'Performable prefix' },
        { label: 'clear', detail: 'Clear all keybindings' },
      ];

      for (const pattern of commonPatterns) {
        if (!partial || pattern.label.toLowerCase().includes(partial)) {
          const item = new vscode.CompletionItem(pattern.label, vscode.CompletionItemKind.Keyword);
          item.detail = pattern.detail;
          items.push(item);
        }
      }

      // Suggest some common full keybinds
      const commonKeybinds = [
        'ctrl+c=copy_to_clipboard',
        'ctrl+v=paste_from_clipboard',
        'ctrl+shift+c=copy_to_clipboard',
        'ctrl+shift+v=paste_from_clipboard',
        'ctrl+t=new_tab',
        'ctrl+w=close_surface',
        'ctrl+shift+t=new_window',
        'ctrl+=increase_font_size',
        'ctrl+-=decrease_font_size',
        'ctrl+0=reset_font_size',
      ];

      for (const kb of commonKeybinds) {
        if (!partial || kb.toLowerCase().includes(partial)) {
          const item = new vscode.CompletionItem(kb, vscode.CompletionItemKind.Snippet);
          item.detail = 'Common keybind';
          items.push(item);
        }
      }
    }

    return items;
  }

  private getThemeCompletions(partial: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Built-in themes and common theme names
    const themes = [
      'auto', 'light', 'dark',
      'Catppuccin Mocha', 'Catppuccin Frappe', 'Catppuccin Latte', 'Catppuccin Macchiato',
      'Dracula', 'Gruvbox Dark', 'Gruvbox Light', 'Nord', 'One Dark', 'Solarized Dark',
      'Solarized Light', 'Tokyo Night', 'GitHub Dark', 'GitHub Light',
    ];

    for (const theme of themes) {
      if (!partial || theme.toLowerCase().includes(partial)) {
        const item = new vscode.CompletionItem(theme, vscode.CompletionItemKind.Value);
        item.detail = 'Theme';
        items.push(item);
      }
    }

    // Light/dark combo pattern
    if (!partial || 'light:'.includes(partial) || 'dark:'.includes(partial)) {
      const item = new vscode.CompletionItem('light:LIGHT_THEME,dark:DARK_THEME', vscode.CompletionItemKind.Snippet);
      item.detail = 'Light/dark theme combination';
      item.insertText = new vscode.SnippetString('light:${1:theme},dark:${2:theme}');
      items.push(item);
    }

    return items;
  }

  private getExampleCompletions(option: ConfigOption, partial: string): vscode.CompletionItem[] {
    if (!option.examples || option.examples.length === 0) {
      return [];
    }

    return option.examples
      .filter(ex => !partial || ex.toLowerCase().includes(partial))
      .map(ex => {
        const item = new vscode.CompletionItem(ex, vscode.CompletionItemKind.Value);
        item.detail = 'Example value';
        return item;
      });
  }

  private getTypeLabel(option: ConfigOption): string {
    let label = option.type;
    if (option.repeatable) {
      label += ' (repeatable)';
    }
    if (option.platforms && option.platforms.length > 0) {
      label += ` [${option.platforms.join(', ')}]`;
    }
    return label;
  }

  private buildKeyDocumentation(key: string, option: ConfigOption): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${key}**\n\n`);
    md.appendMarkdown(`${option.description}\n\n`);
    md.appendMarkdown(`**Type:** ${option.type}\n\n`);

    if (option.enum) {
      md.appendMarkdown(`**Values:** ${option.enum.join(', ')}\n\n`);
    }

    if (option.examples && option.examples.length > 0) {
      md.appendMarkdown(`**Examples:** \`${option.examples.join('`, `')}\`\n\n`);
    }

    if (option.platforms && option.platforms.length > 0) {
      md.appendMarkdown(`**Platforms:** ${option.platforms.join(', ')}\n\n`);
    }

    if (option.deprecated) {
      md.appendMarkdown(`⚠️ **Deprecated**\n\n`);
    }

    return md;
  }
}
