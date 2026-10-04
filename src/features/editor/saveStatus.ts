import type { DocState } from "./docState";

export function saveStatus(doc: Pick<DocState, "saving" | "dirty">) {
  return doc.saving ? "saving" : doc.dirty ? "dirty" : "saved";
}
