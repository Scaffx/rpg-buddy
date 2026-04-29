import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const BASE_MONTHLY_USD = 1.5;
const RATES_CACHE_KEY = "lifeonrpg-usd-rates-v1";
const RATES_TTL_MS = 1000 * 60 * 60 * 12; // 12h

type RatesPayload = {
  updatedAt: number;
  rates: Record<string, number>;
};

const REGION_TO_CURRENCY: Record<string, string> = {
  BR: "BRL",
  US: "USD",
  CA: "CAD",
  MX: "MXN",
  AR: "ARS",
  CL: "CLP",
  CO: "COP",
  PE: "PEN",
  UY: "UYU",
  GB: "GBP",
  IE: "EUR",
  FR: "EUR",
  DE: "EUR",
  ES: "EUR",
  IT: "EUR",
  PT: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  FI: "EUR",
  GR: "EUR",
  LU: "EUR",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  IN: "INR",
  SG: "SGD",
  HK: "HKD",
  AU: "AUD",
  NZ: "NZD",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  BG: "BGN",
  TR: "TRY",
  ZA: "ZAR",
  AE: "AED",
  SA: "SAR",
  IL: "ILS",
  RU: "RUB",
};

function normalizeLocale(i18nLang: string, browserLang: string): string {
  if (i18nLang.includes("-")) return i18nLang;

  const byLanguage: Record<string, string> = {
    pt: "pt-BR",
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
    ja: "ja-JP",
    ko: "ko-KR",
    zh: "zh-CN",
  };

  const mapped = byLanguage[i18nLang.toLowerCase()];
  if (mapped) return mapped;
  return browserLang || "en-US";
}

function detectCurrency(locale: string): string {
  const parts = locale.split("-");
  const region = (parts[1] || "US").toUpperCase();
  return REGION_TO_CURRENCY[region] || "USD";
}

function readCachedRates(): RatesPayload | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatesPayload;
    if (!parsed?.updatedAt || !parsed?.rates) return null;
    if (Date.now() - parsed.updatedAt > RATES_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchUsdRates(): Promise<Record<string, number> | null> {
  const cached = readCachedRates();
  if (cached) return cached.rates;

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) return null;
    const payload = await response.json();
    const rates = payload?.rates as Record<string, number> | undefined;
    if (!rates) return null;

    const cachePayload: RatesPayload = {
      updatedAt: Date.now(),
      rates,
    };
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cachePayload));
    return rates;
  } catch {
    return null;
  }
}

export function useLocalizedPricing() {
  const { i18n } = useTranslation();
  const browserLocale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const locale = useMemo(
    () => normalizeLocale(i18n.resolvedLanguage || "en", browserLocale),
    [i18n.resolvedLanguage, browserLocale],
  );
  const currency = useMemo(() => detectCurrency(locale), [locale]);
  const [rate, setRate] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const rates = await fetchUsdRates();
      const nextRate = rates?.[currency] ?? 1;
      if (mounted) {
        setRate(Number.isFinite(nextRate) && nextRate > 0 ? nextRate : 1);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [currency]);

  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );

  const monthlyValue = BASE_MONTHLY_USD * rate;
  const annualValue = BASE_MONTHLY_USD * 12 * rate;

  return {
    locale,
    currency,
    loading,
    monthlyUsd: BASE_MONTHLY_USD,
    monthlyFormatted: formatter.format(monthlyValue),
    annualFormatted: formatter.format(annualValue),
  };
}
