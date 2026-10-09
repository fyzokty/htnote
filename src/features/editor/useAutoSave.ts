import { useEffect } from "react";

import { installAutoSave } from "@/features/editor/autoSave";

export function useAutoSave() {
  useEffect(() => installAutoSave(), []);
}
