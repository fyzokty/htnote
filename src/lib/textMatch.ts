export function normalizeText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function textMatch(haystack: string, query: string): boolean {
  return normalizeText(haystack).includes(normalizeText(query.trim()));
}
