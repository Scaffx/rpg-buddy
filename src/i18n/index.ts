import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import pt from "./locales/pt.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

export const SUPPORTED_LANGUAGES = [
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
      es: { translation: es },
      ru: { translation: ru },
      zh: { translation: zh },
    },
    fallbackLng: "pt",
    supportedLngs: ["pt", "en", "es", "ru", "zh"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "lifeonrpg-lang",
    },
  });

export default i18n;
