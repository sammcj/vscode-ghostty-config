# Ghostty Config

VS Code extension providing syntax highlighting, validation, completions, and hover documentation for [Ghostty](https://ghostty.org) terminal configuration files.

## Features

- **Syntax Highlighting**: Full TextMate grammar for Ghostty config files
- **Validation**: Real-time diagnostics for invalid keys, values, and duplicates
- **Completions**: Intelligent auto-completion for keys and values (Ctrl+Space)
- **Hover Documentation**: Detailed documentation on hover for all configuration options
- **Open Config Command**: Quickly open your Ghostty config from the command palette

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SamMcLeod.ghostty-config) or search for "Ghostty Config" in the Extensions view.

## Usage

The extension automatically activates for:
- Files named `config` in Ghostty config directories
- Files with `.ghostty` extension

### Open Config Command

Use `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and search for "Ghostty: Open Config" to quickly open your configuration file.

Supported config locations:
- XDG: `~/.config/ghostty/config`
- macOS: `~/Library/Application Support/com.mitchellh.ghostty/config`

## Configuration

| Setting                             | Default   | Description                           |
|-------------------------------------|-----------|---------------------------------------|
| `ghostty-config.enableDiagnostics`  | `true`    | Enable real-time validation           |
| `ghostty-config.diagnosticSeverity` | `Warning` | Severity for unknown key diagnostics  |
| `ghostty-config.showPlatformHints`  | `true`    | Show hints for platform-specific keys |

## Duplicate Key Handling

Unlike some other config extensions, this extension correctly handles keys that can be specified multiple times. The following keys are repeatable and won't trigger duplicate warnings:

- `keybind` - Multiple keyboard bindings
- `font-family`, `font-family-*` - Font fallbacks
- `font-feature`, `font-variation*` - OpenType features
- `palette` - Colour palette entries
- `env` - Environment variables
- `config-file` - Include additional config files
- And more...

## Links

- [Ghostty Documentation](https://ghostty.org/docs)
- [Config Reference](https://ghostty.org/docs/config/reference)
- [Keybind Reference](https://ghostty.org/docs/config/keybind/reference)
- [Report Issues](https://github.com/sammcj/vscode-ghostty/issues)

## Development

```bash
make install    # Install dependencies
make build      # Compile TypeScript
make test       # Run tests
make lint       # Lint source code
make package    # Build .vsix package
```

Press F5 in VS Code to launch Extension Development Host.

## Licence

MIT - See [LICENSE](./LICENSE)
