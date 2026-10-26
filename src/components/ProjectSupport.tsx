import { useState } from "react";
import { Copy, Github, Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDonationUrl, getPixRandomKey, PUBLIC_CODE_URL } from "@/lib/projectSupport";

export function ProjectSupport() {
  const { t } = useTranslation();
  const donationUrl = getDonationUrl(import.meta.env.VITE_DONATION_URL);
  const pixKey = getPixRandomKey(import.meta.env.VITE_DONATION_PIX_KEY);
  const [copyResult, setCopyResult] = useState<"success" | "error" | null>(null);

  const copyPixKey = async () => {
    if (!pixKey) return;
    try {
      await navigator.clipboard.writeText(pixKey);
      setCopyResult("success");
    } catch {
      setCopyResult("error");
    }
  };

  return (
    <section id="support" aria-labelledby="project-support-title" className="py-16 px-4 md:px-8 max-w-5xl mx-auto">
      <div className="rounded-2xl border border-primary/30 bg-card/60 p-6 md:p-10 text-center space-y-5">
        <h2 id="project-support-title" className="text-2xl md:text-3xl font-bold font-[var(--font-display)]">
          {t("project_support.title")}
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">{t("project_support.description")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href={PUBLIC_CODE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-4 py-2 font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <Github className="w-4 h-4" aria-hidden="true" /> {t("project_support.code_cta")}
          </a>
          {donationUrl && (
            <a href={donationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Heart className="w-4 h-4" aria-hidden="true" /> {t("project_support.donate_cta")}
            </a>
          )}
        </div>
        {pixKey && (
          <div className="mx-auto max-w-xl space-y-2">
            <label htmlFor="project-support-pix-key" className="block text-sm font-semibold">{t("project_support.pix_label")}</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input id="project-support-pix-key" value={pixKey} readOnly className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm" />
              <button type="button" onClick={copyPixKey} className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/40 px-4 py-2 font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Copy className="w-4 h-4" aria-hidden="true" /> {t("project_support.pix_copy")}
              </button>
            </div>
            {copyResult === "error" && <p role="alert" className="text-sm text-destructive">{t("project_support.pix_copy_error")}</p>}
            {copyResult === "success" && <p role="status" className="text-sm text-success">{t("project_support.pix_copy_success")}</p>}
          </div>
        )}
        {!donationUrl && !pixKey && <p className="text-sm text-muted-foreground">{t("project_support.donations_preparing")}</p>}
        <p className="text-sm text-muted-foreground">{t("project_support.no_perks")}</p>
      </div>
    </section>
  );
}
