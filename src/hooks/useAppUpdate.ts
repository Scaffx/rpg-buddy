import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION_CODE } from "@/lib/version";

export interface AppRelease {
  id: string;
  version: string;
  version_code: number;
  apk_url: string;
  changelog: string | null;
  is_mandatory: boolean;
  released_at: string;
}

/**
 * Busca a versão mais recente publicada e indica se o app precisa atualizar.
 * Roda a cada 30 minutos automaticamente.
 */
export function useAppUpdate() {
  const query = useQuery({
    queryKey: ["app-latest-release"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_releases" as any)
        .select("*")
        .order("version_code", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AppRelease) ?? null;
    },
    refetchInterval: 1000 * 60 * 30, // 30 min
    staleTime: 1000 * 60 * 5,
  });

  const latest = query.data;
  const hasUpdate = !!latest && latest.version_code > APP_VERSION_CODE;
  const isMandatory = !!latest?.is_mandatory && hasUpdate;

  return {
    latest,
    hasUpdate,
    isMandatory,
    isLoading: query.isLoading,
  };
}
