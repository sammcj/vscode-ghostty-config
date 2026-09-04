/**
 * Find the equals sign separating a keybind trigger from its action.
 *
 * Ghostty treats an equals sign followed by `+` or `=` as part of the
 * trigger. For example, the separator in `super+shift+==equalize_splits`
 * is the second equals sign.
 */
export function findKeybindSeparator(value: string): number {
  let offset = 0;

  while (offset < value.length) {
    const equalsIndex = value.indexOf('=', offset);
    if (equalsIndex === -1) {
      return -1;
    }

    const nextCharacter = value[equalsIndex + 1];
    if (nextCharacter === '+' || nextCharacter === '=') {
      offset = equalsIndex + 1;
      continue;
    }

    return equalsIndex;
  }

  return -1;
}
