#!/usr/bin/env bash
set -euo pipefail

# Fetches the latest Ghostty Config.zig from GitHub and compares it with our
# extension schema, reporting missing keys, deprecated keys, and type info.
#
# Usage:
#   ./scripts/sync-ghostty-config.sh [--branch main] [--json]
#
# Options:
#   --branch BRANCH   Git branch to fetch from (default: main)
#   --json            Output results as JSON (for programmatic use)

REPO="ghostty-org/ghostty"
CONFIG_PATH="src/config/Config.zig"
SCHEMA_PATH="schema/ghostty-config-syntax.schema.json"

BRANCH="main"
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_FILE="$PROJECT_ROOT/$SCHEMA_PATH"

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "Error: Schema file not found at $SCHEMA_FILE" >&2
  exit 1
fi

# Check dependencies
for cmd in curl python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not found" >&2
    exit 1
  fi
done

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

CONFIG_URL="https://raw.githubusercontent.com/$REPO/$BRANCH/$CONFIG_PATH"
echo "Fetching Config.zig from $REPO@$BRANCH..." >&2

if ! curl -fsSL "$CONFIG_URL" -o "$TMPDIR/Config.zig"; then
  echo "Error: Failed to fetch $CONFIG_URL" >&2
  exit 1
fi

echo "Parsing config fields..." >&2

# Extract config field names from Zig source.
# Fields are either @"hyphenated-name": Type or identifier: Type at column 0.
# Filter out function definitions and test blocks that match the pattern.
grep -E '^(@"[a-z]|[a-z])' "$TMPDIR/Config.zig" \
  | grep -E ': ' \
  | sed 's/@"//;s/":.*//' \
  | sed 's/:.*//' \
  | grep -v '^fn ' \
  | grep -v '^pub ' \
  | grep -v '^test ' \
  | sort -u > "$TMPDIR/ghostty-fields.txt"

# Extract keys from our schema.
python3 -c "
import json, sys
with open('$SCHEMA_FILE') as f:
    schema = json.load(f)
keys = sorted(schema.get('options', {}).keys())
for k in keys:
    print(k)
" > "$TMPDIR/schema-keys.txt"

# Compute diffs.
MISSING=$(comm -23 "$TMPDIR/ghostty-fields.txt" "$TMPDIR/schema-keys.txt")
EXTRA=$(comm -13 "$TMPDIR/ghostty-fields.txt" "$TMPDIR/schema-keys.txt")

# Extract compatibility/renamed mappings from the source.
COMPAT=$(grep -E 'compatibilityRenamed|compat[A-Z]' "$TMPDIR/Config.zig" \
  | grep -oE '"[a-z][a-z0-9-]*"' \
  | tr -d '"' \
  | sort -u || true)

# For each missing key, extract its type and doc comment.
get_field_info() {
  local key="$1"
  local file="$TMPDIR/Config.zig"

  # Find the line number of the field declaration.
  local line
  line=$(grep -n "^@\"${key}\"\|^${key}:" "$file" | head -1 | cut -d: -f1)
  if [[ -z "$line" ]]; then
    echo "UNKNOWN"
    return
  fi

  # Extract the type from the declaration line.
  local decl
  decl=$(sed -n "${line}p" "$file")
  local type_info
  type_info=$(echo "$decl" | sed 's/.*: //' | sed 's/ =.*//')
  echo "$type_info"
}

get_doc_comment() {
  local key="$1"
  local file="$TMPDIR/Config.zig"

  local line
  line=$(grep -n "^@\"${key}\"\|^${key}:" "$file" | head -1 | cut -d: -f1)
  if [[ -z "$line" ]]; then
    return
  fi

  # Walk backwards from the field to collect /// doc comments.
  local start=$((line - 1))
  local comments=""
  while [[ $start -ge 1 ]]; do
    local prev
    prev=$(sed -n "${start}p" "$file")
    if echo "$prev" | grep -qE '^\s*///'; then
      local cleaned
      cleaned=$(echo "$prev" | sed 's/^\s*\/\/\/ \?//')
      if [[ -n "$comments" ]]; then
        comments="$cleaned
$comments"
      else
        comments="$cleaned"
      fi
      start=$((start - 1))
    else
      break
    fi
  done
  echo "$comments"
}

GHOSTTY_COUNT=$(wc -l < "$TMPDIR/ghostty-fields.txt" | tr -d ' ')
SCHEMA_COUNT=$(wc -l < "$TMPDIR/schema-keys.txt" | tr -d ' ')
if [[ -z "$MISSING" ]]; then
  MISSING_COUNT=0
else
  MISSING_COUNT=$(echo "$MISSING" | wc -l | tr -d ' ')
fi
if [[ -z "$EXTRA" ]]; then
  EXTRA_COUNT=0
else
  EXTRA_COUNT=$(echo "$EXTRA" | wc -l | tr -d ' ')
fi

if $JSON_OUTPUT; then
  # JSON output mode for programmatic consumption.
  python3 -c "
import json, sys

missing_keys = '''$MISSING'''.strip().split('\n') if '''$MISSING'''.strip() else []
extra_keys = '''$EXTRA'''.strip().split('\n') if '''$EXTRA'''.strip() else []
compat_keys = '''$COMPAT'''.strip().split('\n') if '''$COMPAT'''.strip() else []

result = {
    'ghostty_branch': '$BRANCH',
    'ghostty_field_count': $GHOSTTY_COUNT,
    'schema_key_count': $SCHEMA_COUNT,
    'missing_from_schema': missing_keys,
    'extra_in_schema': extra_keys,
    'compatibility_keys': compat_keys,
    'missing_count': len(missing_keys),
    'extra_count': len(extra_keys)
}
print(json.dumps(result, indent=2))
"
else
  echo ""
  echo "=== Ghostty Config Sync Report ==="
  echo "Source: $REPO@$BRANCH"
  echo "Ghostty fields: $GHOSTTY_COUNT"
  echo "Schema keys:    $SCHEMA_COUNT"
  echo ""

  if [[ "$MISSING_COUNT" -gt 0 ]]; then
    echo "--- Missing from schema ($MISSING_COUNT keys) ---"
    echo ""
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      type_info=$(get_field_info "$key")
      echo "  $key"
      echo "    Type: $type_info"
      doc=$(get_doc_comment "$key")
      if [[ -n "$doc" ]]; then
        # Show first 3 lines of doc comment.
        echo "$doc" | head -3 | while IFS= read -r docline; do
          echo "    Doc:  $docline"
        done
      fi
      echo ""
    done <<< "$MISSING"
  else
    echo "--- No missing keys ---"
    echo ""
  fi

  if [[ "$EXTRA_COUNT" -gt 0 ]]; then
    echo "--- Extra in schema ($EXTRA_COUNT keys, may be deprecated) ---"
    echo ""
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      # Check if it's a known compatibility/renamed key.
      if echo "$COMPAT" | grep -qx "$key"; then
        echo "  $key  [DEPRECATED - in Ghostty compatibility layer]"
      else
        echo "  $key  [NOT FOUND in Ghostty source]"
      fi
    done <<< "$EXTRA"
    echo ""
  else
    echo "--- No extra keys ---"
    echo ""
  fi

  echo "=== Summary ==="
  if [[ "$MISSING_COUNT" -eq 0 ]] && [[ "$EXTRA_COUNT" -eq 0 ]]; then
    echo "Schema is in sync with Ghostty source."
  else
    [[ "$MISSING_COUNT" -gt 0 ]] && echo "Add $MISSING_COUNT missing key(s) to schema."
    [[ "$EXTRA_COUNT" -gt 0 ]] && echo "Review $EXTRA_COUNT extra key(s) in schema (may be deprecated)."
  fi
fi
