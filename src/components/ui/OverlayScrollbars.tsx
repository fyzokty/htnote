import { useEffect } from "react";
import { installOverlayScrollbars } from "@/lib/overlayScrollbars";

export function OverlayScrollbars() {
  useEffect(() => installOverlayScrollbars(), []);
  return null;
}
