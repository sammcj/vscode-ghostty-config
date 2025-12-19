# Ghostty Config Syntax Extension

VSCode extension for Ghostty terminal config files. Uses native VSCode providers (not LSP) for simplicity.

<ARCHITECTURE>
**Schema-driven validation**: All config options defined in `schema/ghostty-syntax.schema.json`. Providers read from this schema - update the JSON to add/modify options, not TypeScript.

**Provider pattern**: Three providers registered in `src/extension.ts`:
- CompletionProvider: Key and value completions
- HoverProvider: Documentation on hover
- DiagnosticProvider: Real-time validation

Schema designed for future Zed extension compatibility (same JSON, different provider implementation).
</ARCHITECTURE>

<CONVENTIONS>
- Config locations: XDG (`~/.config/ghostty/config`) and macOS (`~/Library/Application Support/com.mitchellh.ghostty/config`)
- Validation returns `ValidationResult` with `isValid`, `message`, `severity`
- Parser returns `ParsedLine[]` with types: `keyValue`, `comment`, `empty`, `invalid`
- Use Australian or British English spelling throughout
- Keep documentation concise and actionable
- Always use the latest stable package and github actions versions, always check these if you are adding new packages or actions
- Always run make lint, make test and make build before stating you're done with a change (unless it's documentation only)
- The project uses pnpm, not npm but you should use the makefile as the way to run commands
</CONVENTIONS>

<GOTCHAS>
**Repeatable keys**: Ghostty allows certain keys multiple times (keybinds, fonts, palette). These are in `schema.repeatableKeys[]`. The old extension incorrectly flagged all duplicates - this was the main bug we fixed. Check `isRepeatableKey()` in `src/schema/loader.ts`.

**Unit tests cannot import vscode**: Tests run with plain mocha, not VSCode test runner. Test core logic (parser, validators, schema) directly. Don't test providers - they require VSCode runtime.

**Schema path in tests**: Use `path.join(__dirname, '../../../schema/ghostty-syntax.schema.json')` from compiled test files in `out/test/suite/`.

**CI versioning**: Release workflow auto-increments patch version after lint/test/build pass, commits with `[skip-ci]`, then publishes. Use `[skip-ci]` or `[skip-release]` in commit message to prevent release.
</GOTCHAS>

<TESTING>
```bash
make test      # Unit tests (parser, validators, schema)
make lint      # ESLint
make package   # Build .vsix
```

No integration tests - validating providers requires manual user testing.
</TESTING>
