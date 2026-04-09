export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          user_id: string
          xp_gained: number | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          user_id: string
          xp_gained?: number | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          user_id?: string
          xp_gained?: number | null
        }
        Relationships: []
      }
      attributes: {
        Row: {
          created_at: string
          icon: string
          id: string
          level: number
          name: string
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          level?: number
          name: string
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          level?: number
          name?: string
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          arm_cm: number | null
          body_fat_percent: number | null
          calf_cm: number | null
          chest_cm: number | null
          created_at: string
          hip_cm: number | null
          id: string
          measured_at: string
          notes: string | null
          photo_url: string | null
          thigh_cm: number | null
          user_id: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          arm_cm?: number | null
          body_fat_percent?: number | null
          calf_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          hip_cm?: number | null
          id?: string
          measured_at?: string
          notes?: string | null
          photo_url?: string | null
          thigh_cm?: number | null
          user_id: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          arm_cm?: number | null
          body_fat_percent?: number | null
          calf_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          hip_cm?: number | null
          id?: string
          measured_at?: string
          notes?: string | null
          photo_url?: string | null
          thigh_cm?: number | null
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      boss_battles: {
        Row: {
          boss_id: string
          created_at: string
          damage_dealt: number
          id: string
          user_id: string
          won: boolean
        }
        Insert: {
          boss_id: string
          created_at?: string
          damage_dealt?: number
          id?: string
          user_id: string
          won?: boolean
        }
        Update: {
          boss_id?: string
          created_at?: string
          damage_dealt?: number
          id?: string
          user_id?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "boss_battles_boss_id_fkey"
            columns: ["boss_id"]
            isOneToOne: false
            referencedRelation: "bosses"
            referencedColumns: ["id"]
          },
        ]
      }
      bosses: {
        Row: {
          created_at: string
          description: string | null
          hp: number
          icon: string
          id: string
          level: number
          name: string
          xp_reward: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          hp?: number
          icon?: string
          id?: string
          level?: number
          name: string
          xp_reward?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          hp?: number
          icon?: string
          id?: string
          level?: number
          name?: string
          xp_reward?: number
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          completed: boolean
          created_at: string
          description: string
          id: string
          mission_id: string
          xp_bonus: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          description: string
          id?: string
          mission_id: string
          xp_bonus?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          description?: string
          id?: string
          mission_id?: string
          xp_bonus?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          column_index: number
          column_label: string
          created_at: string
          description: string | null
          icon: string
          id: string
          level_max: number
          level_min: number
          name: string
          parent_class_id: string | null
        }
        Insert: {
          column_index?: number
          column_label?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          level_max?: number
          level_min?: number
          name: string
          parent_class_id?: string | null
        }
        Update: {
          column_index?: number
          column_label?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          level_max?: number
          level_min?: number
          name?: string
          parent_class_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_parent_class_id_fkey"
            columns: ["parent_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tracking: {
        Row: {
          created_at: string | null
          date: string
          id: string
          meals_count: number | null
          user_id: string
          water_ml: number | null
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          meals_count?: number | null
          user_id: string
          water_ml?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          meals_count?: number | null
          user_id?: string
          water_ml?: number | null
        }
        Relationships: []
      }
      gold_history: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_log: {
        Row: {
          id: string
          logged_at: string
          meal_date: string
          meal_number: number
          user_id: string
        }
        Insert: {
          id?: string
          logged_at?: string
          meal_date?: string
          meal_number: number
          user_id: string
        }
        Update: {
          id?: string
          logged_at?: string
          meal_date?: string
          meal_number?: number
          user_id?: string
        }
        Relationships: []
      }
      mission_daily_completions: {
        Row: {
          completion_date: string
          created_at: string
          gold_earned: number | null
          id: string
          mission_id: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          completion_date: string
          created_at?: string
          gold_earned?: number | null
          id?: string
          mission_id: string
          user_id: string
          xp_earned: number
        }
        Update: {
          completion_date?: string
          created_at?: string
          gold_earned?: number | null
          id?: string
          mission_id?: string
          user_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_daily_completions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          attribute_id: string
          completed: boolean
          completed_at: string | null
          created_at: string
          daily_status: Json | null
          days_of_week: Json | null
          description: string | null
          due_date: string | null
          failed_date: string | null
          horario_provavel: string | null
          id: string
          is_failed: boolean
          notes: string | null
          priority: string
          secondary_attribute_ids: Json | null
          status: string
          title: string
          updated_at: string
          user_id: string
          xp_penalized: number
          xp_reward: number
        }
        Insert: {
          attribute_id: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          daily_status?: Json | null
          days_of_week?: Json | null
          description?: string | null
          due_date?: string | null
          failed_date?: string | null
          horario_provavel?: string | null
          id?: string
          is_failed?: boolean
          notes?: string | null
          priority?: string
          secondary_attribute_ids?: Json | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          xp_penalized?: number
          xp_reward?: number
        }
        Update: {
          attribute_id?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          daily_status?: Json | null
          days_of_week?: Json | null
          description?: string | null
          due_date?: string | null
          failed_date?: string | null
          horario_provavel?: string | null
          id?: string
          is_failed?: boolean
          notes?: string | null
          priority?: string
          secondary_attribute_ids?: Json | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          xp_penalized?: number
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "missions_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_class_id: string | null
          display_name: string | null
          id: string
          level: number
          missions_completed: number
          onboarding_completed: boolean
          starter_class: string | null
          starter_item: string | null
          total_xp: number
          updated_at: string
          user_id: string
          xp_today: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_class_id?: string | null
          display_name?: string | null
          id?: string
          level?: number
          missions_completed?: number
          onboarding_completed?: boolean
          starter_class?: string | null
          starter_item?: string | null
          total_xp?: number
          updated_at?: string
          user_id: string
          xp_today?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_class_id?: string | null
          display_name?: string | null
          id?: string
          level?: number
          missions_completed?: number
          onboarding_completed?: boolean
          starter_class?: string | null
          starter_item?: string | null
          total_xp?: number
          updated_at?: string
          user_id?: string
          xp_today?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_class_id_fkey"
            columns: ["current_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_items: {
        Row: {
          cost_percent: number
          created_at: string
          description: string | null
          duration: string | null
          effect: string | null
          icon: string
          icon_color: string | null
          id: string
          name: string
        }
        Insert: {
          cost_percent?: number
          created_at?: string
          description?: string | null
          duration?: string | null
          effect?: string | null
          icon?: string
          icon_color?: string | null
          id?: string
          name: string
        }
        Update: {
          cost_percent?: number
          created_at?: string
          description?: string | null
          duration?: string | null
          effect?: string | null
          icon?: string
          icon_color?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_balance: {
        Row: {
          balance_percent: number
          created_at: string
          gold: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_percent?: number
          created_at?: string
          gold?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_percent?: number
          created_at?: string
          gold?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_buffs: {
        Row: {
          active: boolean
          expires_at: string | null
          id: string
          item_id: string
          purchased_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          expires_at?: string | null
          id?: string
          item_id: string
          purchased_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          expires_at?: string | null
          id?: string
          item_id?: string
          purchased_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_buffs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_health_stats: {
        Row: {
          created_at: string
          current_hp: number | null
          current_mp: number | null
          fatigue: number | null
          id: string
          last_reset_date: string | null
          max_hp: number | null
          max_mp: number | null
          meals_completed: number | null
          meals_target: number | null
          updated_at: string
          user_id: string
          water_completed_ml: number | null
          water_target_ml: number | null
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          current_hp?: number | null
          current_mp?: number | null
          fatigue?: number | null
          id?: string
          last_reset_date?: string | null
          max_hp?: number | null
          max_mp?: number | null
          meals_completed?: number | null
          meals_target?: number | null
          updated_at?: string
          user_id: string
          water_completed_ml?: number | null
          water_target_ml?: number | null
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          current_hp?: number | null
          current_mp?: number | null
          fatigue?: number | null
          id?: string
          last_reset_date?: string | null
          max_hp?: number | null
          max_mp?: number | null
          meals_completed?: number | null
          meals_target?: number | null
          updated_at?: string
          user_id?: string
          water_completed_ml?: number | null
          water_target_ml?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      water_log: {
        Row: {
          amount_ml: number
          id: string
          log_date: string
          logged_at: string
          user_id: string
        }
        Insert: {
          amount_ml?: number
          id?: string
          log_date?: string
          logged_at?: string
          user_id: string
        }
        Update: {
          amount_ml?: number
          id?: string
          log_date?: string
          logged_at?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_history: {
        Row: {
          created_at: string
          date: string
          id: string
          type: string
          user_id: string
          xp_gained: number
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          type?: string
          user_id: string
          xp_gained?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          type?: string
          user_id?: string
          xp_gained?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_rank: { Args: { user_level: number }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
