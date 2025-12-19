import * as vscode from 'vscode';
import { GhosttySchema } from '../types';
import { parseLine } from '../parser/configParser';

export class GhosttyHoverProvider implements vscode.HoverProvider {
  constructor(private schema: GhosttySchema) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | null {
    const line = document.lineAt(position.line).text;

    // Skip comments
    if (line.trim().startsWith('#')) {
      return null;
    }

    const parsed = parseLine(line, position.line);

    if (parsed.type !== 'keyValue' || !parsed.key) {
      return null;
    }

    // Determine if hovering over key or value
    const isOverKey = parsed.keyRange &&
      position.character >= parsed.keyRange.start &&
      position.character <= parsed.keyRange.end;

    const isOverValue = parsed.valueRange &&
      position.character >= parsed.valueRange.start &&
      position.character <= parsed.valueRange.end;

    if (isOverKey) {
      return this.getKeyHover(parsed.key);
    }

    if (isOverValue && parsed.value !== undefined) {
      return this.getValueHover(parsed.key, parsed.value);
    }

    return null;
  }

  private getKeyHover(key: string): vscode.Hover | null {
    const option = this.schema.options[key];

    if (!option) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`⚠️ **Unknown configuration key:** \`${key}\`\n\n`);
      md.appendMarkdown(`This key is not recognised. Check spelling or see [Ghostty docs](https://ghostty.org/docs/config/reference).`);
      return new vscode.Hover(md);
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`## ${key}\n\n`);
    md.appendMarkdown(`${option.description}\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`**Type:** \`${option.type}\`\n\n`);

    if (option.repeatable) {
      md.appendMarkdown(`**Repeatable:** Yes (can be specified multiple times)\n\n`);
    }

    if (option.enum && option.enum.length > 0) {
      md.appendMarkdown(`**Valid values:** \`${option.enum.join('`, `')}\`\n\n`);
    }

    if (option.minimum !== undefined || option.maximum !== undefined) {
      const range: string[] = [];
      if (option.minimum !== undefined) range.push(`min: ${option.minimum}`);
      if (option.maximum !== undefined) range.push(`max: ${option.maximum}`);
      md.appendMarkdown(`**Range:** ${range.join(', ')}\n\n`);
    }

    if (option.examples && option.examples.length > 0) {
      md.appendMarkdown(`**Examples:**\n`);
      for (const ex of option.examples) {
        md.appendMarkdown(`- \`${key} = ${ex}\`\n`);
      }
      md.appendMarkdown(`\n`);
    }

    if (option.platforms && option.platforms.length > 0) {
      const platformEmoji = option.platforms.includes('macos') ? '🍎' : '🐧';
      md.appendMarkdown(`**Platform:** ${platformEmoji} ${option.platforms.join(', ')} only\n\n`);
    }

    if (option.deprecated) {
      md.appendMarkdown(`⚠️ **Deprecated:** This option may be removed in future versions.\n\n`);
    }

    md.appendMarkdown(`[📖 Documentation](https://ghostty.org/docs/config/reference#${key.replace(/-/g, '')})`);

    return new vscode.Hover(md);
  }

  private getValueHover(key: string, value: string): vscode.Hover | null {
    const option = this.schema.options[key];

    if (!option) {
      return null;
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    switch (option.type) {
      case 'boolean':
        return this.getBooleanHover(value);
      case 'color':
        return this.getColorHover(value);
      case 'keybind':
        return this.getKeybindHover(value);
      case 'enum':
        return this.getEnumHover(key, value, option.enum || []);
      default:
        md.appendMarkdown(`**Value:** \`${value}\`\n\n`);
        md.appendMarkdown(`**Type:** ${option.type}`);
        return new vscode.Hover(md);
    }
  }

  private getBooleanHover(value: string): vscode.Hover {
    const md = new vscode.MarkdownString();
    const normalised = value.toLowerCase();
    const isTrue = ['true', 'yes', 'on'].includes(normalised);
    const isFalse = ['false', 'no', 'off'].includes(normalised);

    if (isTrue) {
      md.appendMarkdown(`✅ **Enabled** (\`${value}\` → true)`);
    } else if (isFalse) {
      md.appendMarkdown(`❌ **Disabled** (\`${value}\` → false)`);
    } else {
      md.appendMarkdown(`⚠️ **Invalid boolean:** \`${value}\`\n\n`);
      md.appendMarkdown(`Valid values: \`true\`, \`false\`, \`yes\`, \`no\`, \`on\`, \`off\``);
    }

    return new vscode.Hover(md);
  }

  private getColorHover(value: string): vscode.Hover {
    const md = new vscode.MarkdownString();

    // Check if it's a hex colour
    const hexMatch = value.match(/^#?([0-9a-fA-F]{3,8})$/);
    if (hexMatch) {
      const hex = hexMatch[1];
      let displayColor = value.startsWith('#') ? value : `#${value}`;

      // Normalise 3-char hex to 6-char
      if (hex.length === 3) {
        displayColor = `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
      }

      md.appendMarkdown(`🎨 **Colour:** \`${displayColor}\`\n\n`);
      md.appendMarkdown(`Format: ${hex.length <= 3 ? '#RGB' : hex.length <= 6 ? '#RRGGBB' : '#RRGGBBAA'}`);
    } else {
      // Named colour or special value
      md.appendMarkdown(`🎨 **Named colour:** \`${value}\``);

      if (value === 'cell-foreground' || value === 'cell-background') {
        md.appendMarkdown(`\n\nSpecial value that uses the cell's own colour.`);
      } else if (value === 'transparent') {
        md.appendMarkdown(`\n\nFully transparent colour.`);
      }
    }

    return new vscode.Hover(md);
  }

  private getKeybindHover(value: string): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    if (value === 'clear') {
      md.appendMarkdown(`🗑️ **Clear all keybindings**\n\n`);
      md.appendMarkdown(`Removes all default keybindings. Add your own bindings after this.`);
      return new vscode.Hover(md);
    }

    const equalsIndex = value.indexOf('=');
    if (equalsIndex === -1) {
      md.appendMarkdown(`⚠️ **Invalid keybind format**\n\n`);
      md.appendMarkdown(`Expected: \`[prefix:]trigger=action[:param]\``);
      return new vscode.Hover(md);
    }

    const trigger = value.substring(0, equalsIndex);
    const actionPart = value.substring(equalsIndex + 1);

    md.appendMarkdown(`## Keybind\n\n`);

    // Parse prefix
    const prefixMatch = trigger.match(/^(global:|all:|unconsumed:|performable:)/);
    if (prefixMatch) {
      const prefix = prefixMatch[1].replace(':', '');
      const prefixDescriptions: Record<string, string> = {
        'global': 'Works even when Ghostty is not focused',
        'all': 'Applies to all surfaces',
        'unconsumed': 'Only triggers if not consumed by the terminal',
        'performable': 'Only triggers if the action can be performed',
      };
      md.appendMarkdown(`**Prefix:** \`${prefix}\` - ${prefixDescriptions[prefix] || ''}\n\n`);
    }

    // Parse trigger keys
    const triggerKeys = prefixMatch ? trigger.substring(prefixMatch[1].length) : trigger;
    md.appendMarkdown(`**Trigger:** \`${triggerKeys}\`\n\n`);

    // Check for sequence
    if (triggerKeys.includes('>')) {
      md.appendMarkdown(`📝 *This is a key sequence (press keys in order)*\n\n`);
    }

    // Parse action
    const colonIndex = actionPart.indexOf(':');
    const actionName = colonIndex !== -1 ? actionPart.substring(0, colonIndex) : actionPart;
    const actionParam = colonIndex !== -1 ? actionPart.substring(colonIndex + 1) : null;

    md.appendMarkdown(`**Action:** \`${actionName}\``);
    if (actionParam) {
      md.appendMarkdown(` with parameter \`${actionParam}\``);
    }
    md.appendMarkdown(`\n\n`);

    md.appendMarkdown(`[📖 Keybind docs](https://ghostty.org/docs/config/keybind)`);

    return new vscode.Hover(md);
  }

  private getEnumHover(key: string, value: string, validValues: string[]): vscode.Hover {
    const md = new vscode.MarkdownString();

    const isValid = validValues.includes(value);

    if (isValid) {
      md.appendMarkdown(`✅ **Valid value:** \`${value}\`\n\n`);
    } else {
      md.appendMarkdown(`⚠️ **Unknown value:** \`${value}\`\n\n`);
    }

    md.appendMarkdown(`**All valid values:** \`${validValues.join('`, `')}\``);

    return new vscode.Hover(md);
  }
}
