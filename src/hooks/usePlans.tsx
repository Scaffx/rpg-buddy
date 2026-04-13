import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function usePlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["plans", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*, plan_missions(*, missions(*))")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: { title: string; description?: string; target_value: number; missions: { mission_id: string; value_per_completion: number }[] }) => {
      const { data: planData, error: planError } = await supabase
        .from("plans")
        .insert({
          title: plan.title,
          description: plan.description,
          target_value: plan.target_value,
        })
        .select()
        .single();
      if (planError) throw planError;
      for (const m of plan.missions) {
        const { error: pmError } = await supabase
          .from("plan_missions")
          .insert({
            plan_id: planData.id,
            mission_id: m.mission_id,
            value_per_completion: m.value_per_completion,
          });
        if (pmError) throw pmError;
      }
      return planData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: any) => {
      const { error } = await supabase
        .from("plans")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}
