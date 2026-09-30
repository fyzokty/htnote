import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { resolveLanguage } from "@/i18n/language";
import en from "@/locales/en.json";
import tr from "@/locales/tr.json";

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  fallbackLng: "en",
  lng: resolveLanguage(null, navigator.language),
  interpolation: { escapeValue: false },
});

export default i18n;
