import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current =
    SUPPORTED_LANGUAGES.find((l) => i18n.resolvedLanguage?.startsWith(l.code)) ??
    SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hover:text-primary gap-1.5"
          aria-label={t("nav.language")}
        >
          <Languages className="w-4 h-4" />
          <span className="text-base leading-none">{current.flag}</span>
          {!compact && (
            <span className="hidden md:inline text-xs font-semibold uppercase">
              {current.code}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={
              current.code === lang.code
                ? "bg-primary/10 text-primary font-semibold"
                : ""
            }
          >
            <span className="mr-2 text-base">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
