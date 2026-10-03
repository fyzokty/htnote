import { config as e2eConfig } from "./wdio.conf";

// Aynı geçici fixture kökü ve sürücü yaşam döngüsü; ayrı spec test:e2e'ye katılmaz.
// E2E'nin azaltılmış hareket argümanı ve matchMedia kontrolü de devralınır.
export const config = {
  ...e2eConfig,
  specs: ["./specs/screenshots.docs.ts"],
  async onPrepare() {
    process.env.HTNOTE_E2E_FIXTURE_DIR = "e2e/fixtures-docs";
    await e2eConfig.onPrepare();
  },
};
