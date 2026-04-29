import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const BASE_MONTHLY_USD = 1.5;
const RATES_CACHE_KEY = "lifeonrpg-usd-rates-v1";
const RATES_TTL_MS = 1000 * 60 * 60 * 12; // 12h

/**
 * Preços mensais fixos por moeda (PPP — purchasing power parity).
 * Quando a moeda do usuário está aqui, usamos este valor em vez de
 * converter pelo câmbio. O valor anual é sempre 12x o mensal.
 * Para adicionar/ajustar um preço: edite esta tabela e configure
 * o mesmo valor como "catalog price" no painel do Paddle.
 * Países sem suporte de moeda no Paddle caem em USD automaticamente.
 */
const FIXED_PRICES_MONTHLY: Record<string, number> = {
  // América do Sul
  BRL: 4.99,   // Brasil         — R$ 4,99
  ARS: 1384,   // Argentina      — $ 1.384
  CLP: 4990,   // Chile          — $ 4.990
  COP: 19900,  // Colômbia       — $ 19.900
  PEN: 18.90,  // Peru           — S/ 18,90
  UYU: 199,    // Uruguai        — $ 199
  BOB: 34.90,  // Bolívia        — Bs 34,90
  PYG: 37900,  // Paraguai       — ₲ 37.900

  // América Central
  MXN: 89,     // México         — $ 89
  GTQ: 38.90,  // Guatemala      — Q 38,90
  HNL: 124.90, // Honduras       — L 124,90
  NIO: 179,    // Nicarágua      — C$ 179
  CRC: 2590,   // Costa Rica     — ₡ 2.590
  DOP: 299,    // Rep. Dominicana— RD$ 299

  // USD (inclui EUA + países dolarizados: Ecuador, El Salvador, Panamá, Cuba)
  USD: 4.99,

  // Resto do mundo
  CAD: 6.99,   // Canadá         — $ 6.99
  EUR: 4.49,   // Europa         — € 4,49
  GBP: 3.99,   // Reino Unido    — £ 3,99
  AUD: 7.99,   // Austrália      — $ 7,99
  INR: 129,    // Índia          — ₹ 129
};

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

  // Se a moeda tem preço fixo definido, não precisamos de taxa de câmbio
  const hasFixedPrice = currency in FIXED_PRICES_MONTHLY;

  const [rate, setRate] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(!hasFixedPrice);

  useEffect(() => {
    if (hasFixedPrice) {
      setLoading(false);
      return;
    }

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
  }, [currency, hasFixedPrice]);

  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );

  const monthlyValue = hasFixedPrice
    ? FIXED_PRICES_MONTHLY[currency]
    : BASE_MONTHLY_USD * rate;

  const annualValue = monthlyValue * 12;

  return {
    locale,
    currency,
    loading,
    isFixedPrice: hasFixedPrice,
    monthlyUsd: BASE_MONTHLY_USD,
    monthlyFormatted: formatter.format(monthlyValue),
    annualFormatted: formatter.format(annualValue),
  };
}
