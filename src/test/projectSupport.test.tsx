import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSupport } from "@/components/ProjectSupport";
import { getDonationUrl, getPixRandomKey, PUBLIC_CODE_URL } from "@/lib/projectSupport";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => ({
    "project_support.title": "Acesso gratuito e apoio opcional",
    "project_support.description": "Crie uma conta e use gratuitamente.",
    "project_support.code_cta": "Ver código-fonte (MIT)",
    "project_support.donate_cta": "Fazer doação opcional",
    "project_support.donations_preparing": "As doações estão em preparação.",
    "project_support.no_perks": "Doações não dão bônus nem acesso extra.",
    "project_support.pix_label": "Doação opcional por Pix (chave aleatória)",
    "project_support.pix_copy": "Copiar chave Pix",
    "project_support.pix_copy_success": "Chave Pix copiada.",
    "project_support.pix_copy_error": "Não foi possível copiar. Copie manualmente.",
  } as Record<string, string>)[key] ?? key }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const pixKey = "f19a9de2-7d6b-4e5b-8f50-913d3bd84f27";

function renderSupport() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<ProjectSupport />));
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllEnvs();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("optional project support", () => {
  it("accepts only HTTPS URLs without embedded credentials", () => {
    expect(getDonationUrl(" https://donate.example.org/support?campaign=rpg ")).toBe("https://donate.example.org/support?campaign=rpg");
    for (const unsafe of [undefined, "", "https://", "/donate", "http://donate.example.org", "javascript:alert(1)", "data:text/html,hi", "https://user:pass@donate.example.org", "ftp://donate.example.org"]) {
      expect(getDonationUrl(unsafe)).toBeNull();
    }
  });

  it("accepts only random UUID v4 Pix keys", () => {
    expect(getPixRandomKey(` ${pixKey.toUpperCase()} `)).toBe(pixKey);
    for (const invalid of [undefined, "", "email@example.org", "+5511999999999", "12345678901", "00000000-0000-0000-0000-000000000000", "f19a9de2-7d6b-1e5b-8f50-913d3bd84f27", "f19a9de2-7d6b-4e5b-0f50-913d3bd84f27"]) {
      expect(getPixRandomKey(invalid)).toBeNull();
    }
  });

  it("shows public code and a preparation message when no donation URL is configured", () => {
    vi.stubEnv("VITE_DONATION_URL", "");
    vi.stubEnv("VITE_DONATION_PIX_KEY", "");
    const view = renderSupport();
    expect(view.querySelector(`a[href="${PUBLIC_CODE_URL}"]`)?.textContent).toContain("Ver código-fonte (MIT)");
    expect(view.textContent).toContain("As doações estão em preparação");
    expect(view.textContent).toContain("não dão bônus nem acesso extra");
    expect(view.querySelectorAll("a")).toHaveLength(1);
    expect(view.querySelector("button")).toBeNull();
  });

  it("renders a valid donation link and never renders an unsafe destination", () => {
    vi.stubEnv("VITE_DONATION_URL", "https://donate.example.org/lifeonrpg");
    vi.stubEnv("VITE_DONATION_PIX_KEY", "email@example.org");
    let view = renderSupport();
    expect(view.querySelector('a[href="https://donate.example.org/lifeonrpg"]')?.textContent).toContain("doação opcional");
    expect(view.textContent).not.toContain("em preparação");

    act(() => root!.unmount());
    container!.remove();
    root = null;
    container = null;
    vi.stubEnv("VITE_DONATION_URL", "javascript:alert(1)");
    view = renderSupport();
    expect(view.querySelectorAll("a")).toHaveLength(1);
    expect(view.textContent).toContain("em preparação");
  });

  it("copies a configured Pix key and keeps a useful error visible if copying fails", async () => {
    vi.stubEnv("VITE_DONATION_URL", "");
    vi.stubEnv("VITE_DONATION_PIX_KEY", pixKey);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = renderSupport();
    expect(view.querySelector("input")?.value).toBe(pixKey);
    expect(view.textContent).not.toContain("em preparação");
    await act(async () => { view.querySelector("button")!.click(); });
    expect(writeText).toHaveBeenCalledWith(pixKey);
    expect(view.querySelector('[role="status"]')?.textContent).toContain("Chave Pix copiada");

    writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    await act(async () => { view.querySelector("button")!.click(); });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("Copie manualmente");
    act(() => root!.render(<ProjectSupport />));
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("Copie manualmente");
  });
});
