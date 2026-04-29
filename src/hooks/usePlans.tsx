import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type PlanMissionInput = {
  mission_id: string;
  value_per_completion: number;
};

export type PlanMissionView = {
  id: string;
  mission_id: string | null;
  plan_id: string | null;
  value_per_completion: number;
  missions: {
    id: string;
    title: string;
  } | null;
};

export type PlanView = {
  id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  plan_missions: PlanMissionView[] | null;
};

type CreatePlanPayload = {
  title: string;
  description?: string;
  target_value: number;
  missions: PlanMissionInput[];
};

type UpdatePlanPayload = {
  id: string;
} & Record<string, unknown>;

export function usePlans() {
  const { user } = useAuth();
  return useQuery({
    initialData: [] as PlanView[],
    queryKey: ["plans", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*, plan_missions(*, missions(*))")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as unknown) as PlanView[];
    },
    enabled: !!user,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: CreatePlanPayload) => {
      const sanitizedMissions = plan.missions.map((mission) => ({
        ...mission,
        value_per_completion: Math.max(1, Math.floor(Number(mission.value_per_completion) || 0)),
      }));
      const calculatedTargetValue = sanitizedMissions.reduce(
        (total, mission) => total + mission.value_per_completion,
        0,
      );

      const { data: planData, error: planError } = await supabase
        .from("plans")
        .insert({
          title: plan.title,
          description: plan.description,
          target_value: Math.max(1, calculatedTargetValue),
        })
        .select("id")
        .single();
      if (planError) throw planError;

      for (const m of sanitizedMissions) {
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
    mutationFn: async ({ id, ...fields }: UpdatePlanPayload) => {
      const { error } = await supabase
        .from("plans")
        .update(fields as never)
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
