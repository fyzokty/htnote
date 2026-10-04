export interface SelectOption { value: string; label: string; disabled?: boolean }

export function moveSelectOption(options: SelectOption[], current: number, key: string): number {
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  if (!enabled.length) return -1;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];
  const at = enabled.indexOf(current);
  return enabled[(at + (key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length];
}

export function matchSelectOption(options: SelectOption[], query: string, current: number): number {
  const prefix = [...query].every((letter) => letter === query[0]) ? query[0] : query;
  for (let step = 1; step <= options.length; step++) {
    const index = (Math.max(-1, current) + step) % options.length;
    if (!options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) return index;
  }
  return current;
}
