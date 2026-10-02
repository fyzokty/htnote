import { config as e2eConfig } from "./wdio.conf";

// Aynı geçici fixture kökü ve sürücü yaşam döngüsü; ayrı spec test:e2e'ye katılmaz.
export const config = {
  ...e2eConfig,
  specs: ["./specs/screenshots.docs.ts"],
};
