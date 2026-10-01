export function nextMounted(mounted: string[], activeId: string | null, openIds: string[], max = 5): string[] {
  const open = new Set(openIds);
  const next = mounted.filter((id) => open.has(id) && id !== activeId);
  if (activeId && open.has(activeId)) next.unshift(activeId);
  return next.slice(0, max);
}
