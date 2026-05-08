import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface AccessKey {
  id: string;
  code: string;
  grant_months: number;
  status: "issued" | "redeemed" | "expired" | "revoked";
  owner_user_id: string;
  recipient_user_id: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Keys you issued (annual subscribers get one with grant_months = 2) */
export function useMyGiftKeys() {
  const { user } = useAuth();
  return useQuery<AccessKey[]>({
    queryKey: ["gift-keys", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subscription_access_keys")
        .select("*")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AccessKey[];
    },
  });
}

export interface RedeemResult {
  ok: boolean;
  error?: string;
  grant_months?: number;
  new_period_end?: string;
}

/** Redeem a gift key code */
export function useRedeemKey() {
  const queryClient = useQueryClient();
  return useMutation<RedeemResult, Error, string>({
    mutationFn: async (code: string) => {
      const { data, error } = await (supabase.rpc as any)("redeem_access_key", {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw new Error(error.message);
      return data as RedeemResult;
    },
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
        queryClient.invalidateQueries({ queryKey: ["gift-keys"] });
      }
    },
  });
}
