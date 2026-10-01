import type { Collision } from "@dnd-kit/core";

export function preferTreeRow(collisions: Collision[]): Collision[] {
  const folder = collisions.find(({ id }) => String(id).startsWith("drop:folder:"));
  if (folder) return [folder];
  if (collisions.some(({ id }) => String(id).startsWith("drop:note:"))) return [];
  return collisions.filter(({ id }) => id === "drop:root");
}
