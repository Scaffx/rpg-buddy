export const PUBLIC_CODE_URL = "https://github.com/Scaffx/rpg-buddy";

/** Pix EVP keys are random UUID v4 values, not email, phone, or document keys. */
export function getPixRandomKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
    ? key.toLowerCase()
    : null;
}

/** A donation destination is optional and must be a direct HTTPS URL. */
export function getDonationUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
