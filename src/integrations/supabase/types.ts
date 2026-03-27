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
      missions: {
        Row: {
          attribute_id: string
          completed: boolean
          completed_at: string | null
          created_at: string
          days_of_week: Json | null
          description: string | null
          due_date: string | null
          horario_provavel: string | null
          id: string
          notes: string | null
          priority: string
          status: string
          title: string
          updated_at: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          attribute_id: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          days_of_week?: Json | null
          description?: string | null
          due_date?: string | null
          horario_provavel?: string | null
          id?: string
          notes?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          xp_reward?: number
        }
        Update: {
          attribute_id?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          days_of_week?: Json | null
          description?: string | null
          due_date?: string | null
          horario_provavel?: string | null
          id?: string
          notes?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
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
