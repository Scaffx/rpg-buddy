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
      achievements: {
        Row: {
          condition_type: string
          condition_value: number
          created_at: string
          description: string
          gold_reward: number
          icon: string
          id: string
          slug: string
          title: string
          xp_reward: number
        }
        Insert: {
          condition_type: string
          condition_value?: number
          created_at?: string
          description: string
          gold_reward?: number
          icon?: string
          id?: string
          slug: string
          title: string
          xp_reward?: number
        }
        Update: {
          condition_type?: string
          condition_value?: number
          created_at?: string
          description?: string
          gold_reward?: number
          icon?: string
          id?: string
          slug?: string
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
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
      adventure_journal: {
        Row: {
          content: string
          created_at: string
          entry_date: string
          id: string
          mood: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          entry_date: string
          id?: string
          mood?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          entry_date?: string
          id?: string
          mood?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_releases: {
        Row: {
          apk_url: string
          changelog: string | null
          created_at: string
          id: string
          is_mandatory: boolean
          released_at: string
          version: string
          version_code: number
        }
        Insert: {
          apk_url: string
          changelog?: string | null
          created_at?: string
          id?: string
          is_mandatory?: boolean
          released_at?: string
          version: string
          version_code: number
        }
        Update: {
          apk_url?: string
          changelog?: string | null
          created_at?: string
          id?: string
          is_mandatory?: boolean
          released_at?: string
          version?: string
          version_code?: number
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
      boss_weekly_loot_claims: {
        Row: {
          boss_level: number
          created_at: string
          id: string
          user_id: string
          week_start: string
        }
        Insert: {
          boss_level: number
          created_at?: string
          id?: string
          user_id: string
          week_start: string
        }
        Update: {
          boss_level?: number
          created_at?: string
          id?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      bosses: {
        Row: {
          arena: string | null
          ataque_base: number
          created_at: string
          damage_base: number | null
          defense: number | null
          defesa_base: number
          description: string | null
          difficulty: string | null
          element: string | null
          event_starts_at: string | null
          event_status: string
          gold_reward: number
          hp: number
          hp_max: number
          icon: string
          id: string
          is_final_boss: boolean
          is_world_event: boolean
          keys_cost: number
          level: number
          mechanic: string | null
          name: string
          prereq_boss_id: string | null
          signature_item_name: string | null
          skills: Json | null
          xp_reward: number
        }
        Insert: {
          arena?: string | null
          ataque_base?: number
          created_at?: string
          damage_base?: number | null
          defense?: number | null
          defesa_base?: number
          description?: string | null
          difficulty?: string | null
          element?: string | null
          event_starts_at?: string | null
          event_status?: string
          gold_reward?: number
          hp?: number
          hp_max?: number
          icon?: string
          id?: string
          is_final_boss?: boolean
          is_world_event?: boolean
          keys_cost?: number
          level?: number
          mechanic?: string | null
          name: string
          prereq_boss_id?: string | null
          signature_item_name?: string | null
          skills?: Json | null
          xp_reward?: number
        }
        Update: {
          arena?: string | null
          ataque_base?: number
          created_at?: string
          damage_base?: number | null
          defense?: number | null
          defesa_base?: number
          description?: string | null
          difficulty?: string | null
          element?: string | null
          event_starts_at?: string | null
          event_status?: string
          gold_reward?: number
          hp?: number
          hp_max?: number
          icon?: string
          id?: string
          is_final_boss?: boolean
          is_world_event?: boolean
          keys_cost?: number
          level?: number
          mechanic?: string | null
          name?: string
          prereq_boss_id?: string | null
          signature_item_name?: string | null
          skills?: Json | null
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "bosses_prereq_boss_id_fkey"
            columns: ["prereq_boss_id"]
            isOneToOne: false
            referencedRelation: "bosses"
            referencedColumns: ["id"]
          },
        ]
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
          is_healer: boolean
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
          is_healer?: boolean
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
          is_healer?: boolean
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
      co_op_mission_members: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: string
          joined_at: string
          mission_id: string
          user_id: string
          xp_claimed: boolean
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          joined_at?: string
          mission_id: string
          user_id: string
          xp_claimed?: boolean
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          joined_at?: string
          mission_id?: string
          user_id?: string
          xp_claimed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "co_op_mission_members_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "co_op_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      co_op_missions: {
        Row: {
          completed_at: string | null
          created_at: string
          creator_id: string
          description: string
          id: string
          max_players: number
          status: string
          title: string
          xp_per_player: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          creator_id: string
          description?: string
          id?: string
          max_players?: number
          status?: string
          title: string
          xp_per_player?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          max_players?: number
          status?: string
          title?: string
          xp_per_player?: number
        }
        Relationships: []
      }
      combat_turn_logs: {
        Row: {
          combate_id: string
          created_at: string
          dado_boss: number
          dado_player: number
          dano_boss: number
          dano_player: number
          efeitos_boss: Json
          efeitos_player: Json
          habilidade_boss: string | null
          habilidade_player: string | null
          hp_boss_apos: number
          hp_player_apos: number
          id: string
          rodada: number
          status: string
          user_id: string
        }
        Insert: {
          combate_id: string
          created_at?: string
          dado_boss?: number
          dado_player?: number
          dano_boss?: number
          dano_player?: number
          efeitos_boss?: Json
          efeitos_player?: Json
          habilidade_boss?: string | null
          habilidade_player?: string | null
          hp_boss_apos?: number
          hp_player_apos?: number
          id?: string
          rodada?: number
          status?: string
          user_id: string
        }
        Update: {
          combate_id?: string
          created_at?: string
          dado_boss?: number
          dado_player?: number
          dano_boss?: number
          dano_player?: number
          efeitos_boss?: Json
          efeitos_player?: Json
          habilidade_boss?: string | null
          habilidade_player?: string | null
          hp_boss_apos?: number
          hp_player_apos?: number
          id?: string
          rodada?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combat_turn_logs_combate_id_fkey"
            columns: ["combate_id"]
            isOneToOne: false
            referencedRelation: "combates_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      combates_ativos: {
        Row: {
          boss_id: string
          boss_status: Json
          created_at: string
          hp_atual_boss: number
          hp_atual_personagem: number
          id: string
          personagem_id: string
          status: string
          turno_atual: string
          updated_at: string
        }
        Insert: {
          boss_id: string
          boss_status?: Json
          created_at?: string
          hp_atual_boss: number
          hp_atual_personagem: number
          id?: string
          personagem_id: string
          status?: string
          turno_atual?: string
          updated_at?: string
        }
        Update: {
          boss_id?: string
          boss_status?: Json
          created_at?: string
          hp_atual_boss?: number
          hp_atual_personagem?: number
          id?: string
          personagem_id?: string
          status?: string
          turno_atual?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "combates_ativos_boss_id_fkey"
            columns: ["boss_id"]
            isOneToOne: false
            referencedRelation: "bosses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combates_ativos_personagem_id_fkey"
            columns: ["personagem_id"]
            isOneToOne: false
            referencedRelation: "personagens"
            referencedColumns: ["id"]
          },
        ]
      }
      companions: {
        Row: {
          atk: number
          companion_role: string
          companion_type: string
          created_at: string
          current_hp: number
          current_mp: number
          def: number
          id: string
          last_fed_at: string | null
          last_played_at: string | null
          level: number
          max_hp: number
          max_mp: number
          mood: number
          name: string
          origin: string
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          atk?: number
          companion_role?: string
          companion_type?: string
          created_at?: string
          current_hp?: number
          current_mp?: number
          def?: number
          id?: string
          last_fed_at?: string | null
          last_played_at?: string | null
          level?: number
          max_hp?: number
          max_mp?: number
          mood?: number
          name?: string
          origin?: string
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          atk?: number
          companion_role?: string
          companion_type?: string
          created_at?: string
          current_hp?: number
          current_mp?: number
          def?: number
          id?: string
          last_fed_at?: string | null
          last_played_at?: string | null
          level?: number
          max_hp?: number
          max_mp?: number
          mood?: number
          name?: string
          origin?: string
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      crafting_recipes: {
        Row: {
          class_required: string
          crafting_icon: string | null
          created_at: string
          description: string | null
          gold_cost: number
          id: string
          item_output_id: string
          materials_cost: number
          name: string
        }
        Insert: {
          class_required: string
          crafting_icon?: string | null
          created_at?: string
          description?: string | null
          gold_cost?: number
          id?: string
          item_output_id: string
          materials_cost?: number
          name: string
        }
        Update: {
          class_required?: string
          crafting_icon?: string | null
          created_at?: string
          description?: string | null
          gold_cost?: number
          id?: string
          item_output_id?: string
          materials_cost?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crafting_recipes_item_output_id_fkey"
            columns: ["item_output_id"]
            isOneToOne: false
            referencedRelation: "game_items"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tracking: {
        Row: {
          created_at: string
          date: string
          id: string
          meals_count: number
          updated_at: string
          user_id: string
          water_ml: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          meals_count?: number
          updated_at?: string
          user_id: string
          water_ml?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          meals_count?: number
          updated_at?: string
          user_id?: string
          water_ml?: number
        }
        Relationships: []
      }
      dungeon_partnerships: {
        Row: {
          created_at: string
          id: string
          last_dungeon_at: string
          runs_together: number
          user_a_id: string
          user_b_id: string
          victories_together: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_dungeon_at?: string
          runs_together?: number
          user_a_id: string
          user_b_id: string
          victories_together?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_dungeon_at?: string
          runs_together?: number
          user_a_id?: string
          user_b_id?: string
          victories_together?: number
        }
        Relationships: []
      }
      dungeon_session_players: {
        Row: {
          current_hp: number
          display_name: string
          id: string
          is_alive: boolean
          is_healer: boolean
          is_host: boolean
          joined_at: string
          max_hp: number
          player_atk: number
          player_class_id: string | null
          player_def: number
          player_level: number
          session_id: string
          user_id: string
        }
        Insert: {
          current_hp: number
          display_name: string
          id?: string
          is_alive?: boolean
          is_healer?: boolean
          is_host?: boolean
          joined_at?: string
          max_hp: number
          player_atk?: number
          player_class_id?: string | null
          player_def?: number
          player_level?: number
          session_id: string
          user_id: string
        }
        Update: {
          current_hp?: number
          display_name?: string
          id?: string
          is_alive?: boolean
          is_healer?: boolean
          is_host?: boolean
          joined_at?: string
          max_hp?: number
          player_atk?: number
          player_class_id?: string | null
          player_def?: number
          player_level?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dungeon_session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dungeon_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dungeon_sessions: {
        Row: {
          created_at: string
          current_room: number
          dungeon_id: string
          event_boss_id: string | null
          host_user_id: string
          id: string
          invite_code: string
          layout_index: number
          max_players: number
          session_log: Json
          session_loot: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_room?: number
          dungeon_id: string
          event_boss_id?: string | null
          host_user_id: string
          id?: string
          invite_code: string
          layout_index?: number
          max_players?: number
          session_log?: Json
          session_loot?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_room?: number
          dungeon_id?: string
          event_boss_id?: string | null
          host_user_id?: string
          id?: string
          invite_code?: string
          layout_index?: number
          max_players?: number
          session_log?: Json
          session_loot?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dungeon_sessions_event_boss_id_fkey"
            columns: ["event_boss_id"]
            isOneToOne: false
            referencedRelation: "bosses"
            referencedColumns: ["id"]
          },
        ]
      }
      fragment_dungeon_players: {
        Row: {
          current_hp: number
          display_name: string
          id: string
          is_alive: boolean
          is_host: boolean
          joined_at: string
          max_hp: number
          player_atk: number
          player_class: string
          player_def: number
          player_level: number
          session_id: string
          user_id: string
        }
        Insert: {
          current_hp?: number
          display_name: string
          id?: string
          is_alive?: boolean
          is_host?: boolean
          joined_at?: string
          max_hp?: number
          player_atk?: number
          player_class?: string
          player_def?: number
          player_level?: number
          session_id: string
          user_id: string
        }
        Update: {
          current_hp?: number
          display_name?: string
          id?: string
          is_alive?: boolean
          is_host?: boolean
          joined_at?: string
          max_hp?: number
          player_atk?: number
          player_class?: string
          player_def?: number
          player_level?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fragment_dungeon_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fragment_dungeon_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fragment_dungeon_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          dungeon_tier: string
          fragments_spent: number
          host_id: string
          id: string
          invite_code: string | null
          is_public: boolean
          max_players: number
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dungeon_tier: string
          fragments_spent?: number
          host_id: string
          id?: string
          invite_code?: string | null
          is_public?: boolean
          max_players?: number
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dungeon_tier?: string
          fragments_spent?: number
          host_id?: string
          id?: string
          invite_code?: string | null
          is_public?: boolean
          max_players?: number
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      friend_challenges: {
        Row: {
          accepted_at: string | null
          battle_log: Json | null
          challenge_type: string
          challenged_completed: boolean
          challenged_id: string
          challenger_completed: boolean
          challenger_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          duration_days: number | null
          expires_at: string | null
          id: string
          status: string
          title: string
          winner_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          battle_log?: Json | null
          challenge_type?: string
          challenged_completed?: boolean
          challenged_id: string
          challenger_completed?: boolean
          challenger_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          status?: string
          title: string
          winner_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          battle_log?: Json | null
          challenge_type?: string
          challenged_completed?: boolean
          challenged_id?: string
          challenger_completed?: boolean
          challenger_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          status?: string
          title?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_challenged"
            columns: ["challenged_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_challenger"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_items: {
        Row: {
          agi_bonus: number
          atk_bonus: number
          boss_drop_level: number | null
          category: string
          created_at: string
          crit_bonus: number
          def_bonus: number
          description: string | null
          effect: string | null
          hp_bonus: number
          icon: string
          id: string
          is_consumable: boolean
          is_starter: boolean
          level_required: number
          matk_bonus: number
          mp_bonus: number
          name: string
          rarity: string
          requer_sintonizacao: boolean
          required_attribute: string | null
          required_attribute_level: number | null
          shop_price: number | null
          stackable: boolean
          starter_class: string | null
          stat_label: string | null
          weapon_element: string | null
          weapon_passive: string | null
          weapon_skill: Json | null
        }
        Insert: {
          agi_bonus?: number
          atk_bonus?: number
          boss_drop_level?: number | null
          category?: string
          created_at?: string
          crit_bonus?: number
          def_bonus?: number
          description?: string | null
          effect?: string | null
          hp_bonus?: number
          icon?: string
          id?: string
          is_consumable?: boolean
          is_starter?: boolean
          level_required?: number
          matk_bonus?: number
          mp_bonus?: number
          name: string
          rarity?: string
          requer_sintonizacao?: boolean
          required_attribute?: string | null
          required_attribute_level?: number | null
          shop_price?: number | null
          stackable?: boolean
          starter_class?: string | null
          stat_label?: string | null
          weapon_element?: string | null
          weapon_passive?: string | null
          weapon_skill?: Json | null
        }
        Update: {
          agi_bonus?: number
          atk_bonus?: number
          boss_drop_level?: number | null
          category?: string
          created_at?: string
          crit_bonus?: number
          def_bonus?: number
          description?: string | null
          effect?: string | null
          hp_bonus?: number
          icon?: string
          id?: string
          is_consumable?: boolean
          is_starter?: boolean
          level_required?: number
          matk_bonus?: number
          mp_bonus?: number
          name?: string
          rarity?: string
          requer_sintonizacao?: boolean
          required_attribute?: string | null
          required_attribute_level?: number | null
          shop_price?: number | null
          stackable?: boolean
          starter_class?: string | null
          stat_label?: string | null
          weapon_element?: string | null
          weapon_passive?: string | null
          weapon_skill?: Json | null
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
      hero_story_choices: {
        Row: {
          fenrir_allied: boolean
          ferreiro_rescued: boolean
          guerreiro_imortal_defeated: boolean
          phoenix_fused: boolean
          phoenix_kill_count: number
          picareta_adamantina: boolean
          skeleton_champion: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          fenrir_allied?: boolean
          ferreiro_rescued?: boolean
          guerreiro_imortal_defeated?: boolean
          phoenix_fused?: boolean
          phoenix_kill_count?: number
          picareta_adamantina?: boolean
          skeleton_champion?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          fenrir_allied?: boolean
          ferreiro_rescued?: boolean
          guerreiro_imortal_defeated?: boolean
          phoenix_fused?: boolean
          phoenix_kill_count?: number
          picareta_adamantina?: boolean
          skeleton_champion?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historico: {
        Row: {
          created_at: string | null
          descricao: string
          id: number
          tipo: string
          usuario_id: number | null
          xp_ganho: number
        }
        Insert: {
          created_at?: string | null
          descricao: string
          id?: number
          tipo: string
          usuario_id?: number | null
          xp_ganho: number
        }
        Update: {
          created_at?: string | null
          descricao?: string
          id?: number
          tipo?: string
          usuario_id?: number | null
          xp_ganho?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
          gold_earned: number
          id: string
          mission_id: string | null
          user_id: string
          xp_earned: number
        }
        Insert: {
          completion_date?: string
          created_at?: string
          gold_earned?: number
          id?: string
          mission_id?: string | null
          user_id: string
          xp_earned?: number
        }
        Update: {
          completion_date?: string
          created_at?: string
          gold_earned?: number
          id?: string
          mission_id?: string | null
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
          anchor: string | null
          attribute_id: string | null
          completed: boolean
          completed_at: string | null
          creation_source: string
          created_at: string
          daily_status: Json | null
          days_of_week: Json | null
          description: string | null
          due_date: string | null
          failed_date: string | null
          frequency_type: string
          weekly_started_at: string | null
          horario_provavel: string | null
          id: string
          is_failed: boolean
          is_anchor: boolean
          max_count: number | null
          mission_category: string | null
          notes: string | null
          npc_id: string | null
          priority: string | null
          secondary_attribute_ids: Json | null
          status: string | null
          target_count: number | null
          title: string
          updated_at: string
          user_id: string
          xp_penalized: number
          xp_reward: number
        }
        Insert: {
          anchor?: string | null
          attribute_id?: string | null
          completed?: boolean
          completed_at?: string | null
          creation_source?: string
          created_at?: string
          daily_status?: Json | null
          days_of_week?: Json | null
          description?: string | null
          due_date?: string | null
          failed_date?: string | null
          frequency_type?: string
          weekly_started_at?: string | null
          horario_provavel?: string | null
          id?: string
          is_failed?: boolean
          is_anchor?: boolean
          max_count?: number | null
          mission_category?: string | null
          notes?: string | null
          npc_id?: string | null
          priority?: string | null
          secondary_attribute_ids?: Json | null
          status?: string | null
          target_count?: number | null
          title: string
          updated_at?: string
          user_id?: string
          xp_penalized?: number
          xp_reward?: number
        }
        Update: {
          anchor?: string | null
          attribute_id?: string | null
          completed?: boolean
          completed_at?: string | null
          creation_source?: string
          created_at?: string
          daily_status?: Json | null
          days_of_week?: Json | null
          description?: string | null
          due_date?: string | null
          failed_date?: string | null
          frequency_type?: string
          weekly_started_at?: string | null
          horario_provavel?: string | null
          id?: string
          is_failed?: boolean
          is_anchor?: boolean
          max_count?: number | null
          mission_category?: string | null
          notes?: string | null
          npc_id?: string | null
          priority?: string | null
          secondary_attribute_ids?: Json | null
          status?: string | null
          target_count?: number | null
          title?: string
          updated_at?: string
          user_id?: string
          xp_penalized?: number
          xp_reward?: number
        }
        Relationships: []
      }
      mission_weekly_progress: {
        Row: {
          created_at: string
          current_count: number
          evaluated_at: string | null
          evaluation_status: string
          id: string
          last_completed_date: string | null
          milestone_paid: boolean
          mission_id: string
          shortfall: number | null
          target_snapshot: number | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          current_count?: number
          evaluated_at?: string | null
          evaluation_status?: string
          id?: string
          last_completed_date?: string | null
          milestone_paid?: boolean
          mission_id: string
          shortfall?: number | null
          target_snapshot?: number | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          current_count?: number
          evaluated_at?: string | null
          evaluation_status?: string
          id?: string
          last_completed_date?: string | null
          milestone_paid?: boolean
          mission_id?: string
          shortfall?: number | null
          target_snapshot?: number | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_weekly_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missoes: {
        Row: {
          atributo: string
          created_at: string | null
          data_conclusao: string | null
          data_criacao: string | null
          id: number
          status: string | null
          titulo: string
          usuario_id: number | null
          xp_recompensa: number | null
        }
        Insert: {
          atributo: string
          created_at?: string | null
          data_conclusao?: string | null
          data_criacao?: string | null
          id?: number
          status?: string | null
          titulo: string
          usuario_id?: number | null
          xp_recompensa?: number | null
        }
        Update: {
          atributo?: string
          created_at?: string | null
          data_conclusao?: string | null
          data_criacao?: string | null
          id?: number
          status?: string | null
          titulo?: string
          usuario_id?: number | null
          xp_recompensa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "missoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      npc_affinity: {
        Row: {
          affinity_level: number
          affinity_xp: number
          id: string
          npc_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affinity_level?: number
          affinity_xp?: number
          id?: string
          npc_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affinity_level?: number
          affinity_xp?: number
          id?: string
          npc_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      npc_challenge_completions: {
        Row: {
          challenge_id: string
          completed_at: string
          gold_earned: number
          id: string
          npc_id: string
          user_id: string
          week_token: string
          xp_earned: number
        }
        Insert: {
          challenge_id: string
          completed_at?: string
          gold_earned?: number
          id?: string
          npc_id: string
          user_id: string
          week_token: string
          xp_earned?: number
        }
        Update: {
          challenge_id?: string
          completed_at?: string
          gold_earned?: number
          id?: string
          npc_id?: string
          user_id?: string
          week_token?: string
          xp_earned?: number
        }
        Relationships: []
      }
      npc_weekly_challenges: {
        Row: {
          challenge_id: string
          created_at: string
          description: string
          gold_reward: number
          id: string
          npc_id: string
          reward_item_id: string | null
          reward_item_quantity: number
          title: string
          user_id: string
          week_token: string
          xp_reward: number
        }
        Insert: {
          challenge_id: string
          created_at?: string
          description: string
          gold_reward?: number
          id?: string
          npc_id: string
          reward_item_id?: string | null
          reward_item_quantity?: number
          title: string
          user_id: string
          week_token: string
          xp_reward?: number
        }
        Update: {
          challenge_id?: string
          created_at?: string
          description?: string
          gold_reward?: number
          id?: string
          npc_id?: string
          reward_item_id?: string | null
          reward_item_quantity?: number
          title?: string
          user_id?: string
          week_token?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "npc_weekly_challenges_reward_item_id_fkey"
            columns: ["reward_item_id"]
            isOneToOne: false
            referencedRelation: "game_items"
            referencedColumns: ["id"]
          },
        ]
      }
      personagens: {
        Row: {
          ataque_base: number
          created_at: string
          defesa_base: number
          hp_max: number
          id: string
          nivel: number
          updated_at: string
          xp_atual: number
        }
        Insert: {
          ataque_base?: number
          created_at?: string
          defesa_base?: number
          hp_max?: number
          id: string
          nivel?: number
          updated_at?: string
          xp_atual?: number
        }
        Update: {
          ataque_base?: number
          created_at?: string
          defesa_base?: number
          hp_max?: number
          id?: string
          nivel?: number
          updated_at?: string
          xp_atual?: number
        }
        Relationships: []
      }
      pet_catalog: {
        Row: {
          atk: number
          def: number
          emoji: string
          hp: number
          mp: number
          name: string
          pet_type: string
          price: number
          role: string
          sort: number
        }
        Insert: {
          atk: number
          def: number
          emoji: string
          hp: number
          mp: number
          name: string
          pet_type: string
          price: number
          role: string
          sort?: number
        }
        Update: {
          atk?: number
          def?: number
          emoji?: string
          hp?: number
          mp?: number
          name?: string
          pet_type?: string
          price?: number
          role?: string
          sort?: number
        }
        Relationships: []
      }
      plan_missions: {
        Row: {
          created_at: string
          id: string
          mission_id: string
          plan_id: string
          value_per_completion: number
        }
        Insert: {
          created_at?: string
          id?: string
          mission_id: string
          plan_id: string
          value_per_completion?: number
        }
        Update: {
          created_at?: string
          id?: string
          mission_id?: string
          plan_id?: string
          value_per_completion?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_missions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          target_value: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          target_value?: number
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          target_value?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_portal_fragments: {
        Row: {
          dungeon_expires_at: string | null
          dungeon_revealed_at: string | null
          fragments: number
          lifetime_fragments: number
          pending_dungeon: string | null
          updated_at: string
          user_id: string
          week_start: string | null
          weekly_fragments: number
        }
        Insert: {
          dungeon_expires_at?: string | null
          dungeon_revealed_at?: string | null
          fragments?: number
          lifetime_fragments?: number
          pending_dungeon?: string | null
          updated_at?: string
          user_id: string
          week_start?: string | null
          weekly_fragments?: number
        }
        Update: {
          dungeon_expires_at?: string | null
          dungeon_revealed_at?: string | null
          fragments?: number
          lifetime_fragments?: number
          pending_dungeon?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string | null
          weekly_fragments?: number
        }
        Relationships: []
      }
      player_portal_rolls: {
        Row: {
          created_at: string
          event_id: string
          portal_color: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          portal_color: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          portal_color?: string
          user_id?: string
        }
        Relationships: []
      }
      player_skill_nodes: {
        Row: {
          node_id: string
          rank: number
          updated_at: string
          user_id: string
        }
        Insert: {
          node_id: string
          rank?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          node_id?: string
          rank?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_skill_nodes_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "skill_tree_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_events: {
        Row: {
          created_at: string
          dungeon_tier: string | null
          dungeon_tier_weight: Json | null
          ends_at: string
          id: string
          is_active: boolean
          legendary_item_dropped: boolean
          max_fragments_drop: number
          portal_closed_at: string | null
          portal_color: string | null
          starts_at: string
          total_fragments_dropped: number
        }
        Insert: {
          created_at?: string
          dungeon_tier?: string | null
          dungeon_tier_weight?: Json | null
          ends_at: string
          id?: string
          is_active?: boolean
          legendary_item_dropped?: boolean
          max_fragments_drop?: number
          portal_closed_at?: string | null
          portal_color?: string | null
          starts_at: string
          total_fragments_dropped?: number
        }
        Update: {
          created_at?: string
          dungeon_tier?: string | null
          dungeon_tier_weight?: Json | null
          ends_at?: string
          id?: string
          is_active?: boolean
          legendary_item_dropped?: boolean
          max_fragments_drop?: number
          portal_closed_at?: string | null
          portal_color?: string | null
          starts_at?: string
          total_fragments_dropped?: number
        }
        Relationships: []
      }
      portal_run_participants: {
        Row: {
          event_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_run_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "portal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_runs: {
        Row: {
          completed: boolean
          event_id: string
          fragment_earned: boolean
          fragments_received: number
          gold_earned: number
          id: string
          legendary_item_received: boolean
          portal_color: string
          ran_at: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          completed?: boolean
          event_id: string
          fragment_earned?: boolean
          fragments_received?: number
          gold_earned?: number
          id?: string
          legendary_item_received?: boolean
          portal_color: string
          ran_at?: string
          user_id: string
          xp_earned?: number
        }
        Update: {
          completed?: boolean
          event_id?: string
          fragment_earned?: boolean
          fragments_received?: number
          gold_earned?: number
          id?: string
          legendary_item_received?: boolean
          portal_color?: string
          ran_at?: string
          user_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "portal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_scans: {
        Row: {
          event_id: string
          id: string
          scanned_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          scanned_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          scanned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_scans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "portal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          days_of_week: number[]
          description: string | null
          dismissed_at: string | null
          ends_on: string | null
          id: string
          notified_at: string | null
          recurrence_type: string
          remind_at: string
          remind_time: string | null
          starts_on: string | null
          timezone: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          description?: string | null
          dismissed_at?: string | null
          ends_on?: string | null
          id?: string
          notified_at?: string | null
          recurrence_type?: string
          remind_at: string
          remind_time?: string | null
          starts_on?: string | null
          timezone?: string
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          description?: string | null
          dismissed_at?: string | null
          ends_on?: string | null
          id?: string
          notified_at?: string | null
          recurrence_type?: string
          remind_at?: string
          remind_time?: string | null
          starts_on?: string | null
          timezone?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          boss_keys: number
          class_kit_claimed: boolean
          combat_skill_loadout: Json
          created_at: string
          current_class_id: string | null
          display_name: string | null
          id: string
          inspired_available: boolean
          inspired_earned_at: string | null
          last_name_change: string | null
          level: number
          missions_completed: number
          name_changed_at: string | null
          onboarding_completed: boolean
          pontos_talento: number
          region: string | null
          starter_class: string | null
          starter_item: string | null
          starter_kit_claimed: boolean
          streak_current_days: number
          streak_last_completed_date: string | null
          streak_protector_charges: number
          streak_protector_max: number
          streak_protector_week: string | null
          total_xp: number
          updated_at: string
          user_id: string
          xp_today: number
        }
        Insert: {
          avatar_url?: string | null
          boss_keys?: number
          class_kit_claimed?: boolean
          combat_skill_loadout?: Json
          created_at?: string
          current_class_id?: string | null
          display_name?: string | null
          id?: string
          inspired_available?: boolean
          inspired_earned_at?: string | null
          last_name_change?: string | null
          level?: number
          missions_completed?: number
          name_changed_at?: string | null
          onboarding_completed?: boolean
          pontos_talento?: number
          region?: string | null
          starter_class?: string | null
          starter_item?: string | null
          starter_kit_claimed?: boolean
          streak_current_days?: number
          streak_last_completed_date?: string | null
          streak_protector_charges?: number
          streak_protector_max?: number
          streak_protector_week?: string | null
          total_xp?: number
          updated_at?: string
          user_id: string
          xp_today?: number
        }
        Update: {
          avatar_url?: string | null
          boss_keys?: number
          class_kit_claimed?: boolean
          combat_skill_loadout?: Json
          created_at?: string
          current_class_id?: string | null
          display_name?: string | null
          id?: string
          inspired_available?: boolean
          inspired_earned_at?: string | null
          last_name_change?: string | null
          level?: number
          missions_completed?: number
          name_changed_at?: string | null
          onboarding_completed?: boolean
          pontos_talento?: number
          region?: string | null
          starter_class?: string | null
          starter_item?: string | null
          starter_kit_claimed?: boolean
          streak_current_days?: number
          streak_last_completed_date?: string | null
          streak_protector_charges?: number
          streak_protector_max?: number
          streak_protector_week?: string | null
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
      quiz_questions: {
        Row: {
          category: string
          correct_index: number
          created_at: string
          difficulty: string
          id: string
          options: Json
          question: string
        }
        Insert: {
          category?: string
          correct_index: number
          created_at?: string
          difficulty?: string
          id?: string
          options: Json
          question: string
        }
        Update: {
          category?: string
          correct_index?: number
          created_at?: string
          difficulty?: string
          id?: string
          options?: Json
          question?: string
        }
        Relationships: []
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
      skill_tree_nodes: {
        Row: {
          area: string
          branch: string
          cost: number
          description: string
          effect: Json
          exclusive_group: string | null
          gate_points: number
          id: string
          max_rank: number
          name: string
          node_type: string
          prereq_node_id: string | null
          sort: number
          tier: number
          tree: string
        }
        Insert: {
          area: string
          branch?: string
          cost?: number
          description: string
          effect?: Json
          exclusive_group?: string | null
          gate_points?: number
          id: string
          max_rank?: number
          name: string
          node_type?: string
          prereq_node_id?: string | null
          sort?: number
          tier?: number
          tree?: string
        }
        Update: {
          area?: string
          branch?: string
          cost?: number
          description?: string
          effect?: Json
          exclusive_group?: string | null
          gate_points?: number
          id?: string
          max_rank?: number
          name?: string
          node_type?: string
          prereq_node_id?: string | null
          sort?: number
          tier?: number
          tree?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_tree_nodes_prereq_node_id_fkey"
            columns: ["prereq_node_id"]
            isOneToOne: false
            referencedRelation: "skill_tree_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_access_keys: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          grant_months: number
          granted_by_subscription_id: string
          id: string
          owner_user_id: string
          recipient_user_id: string | null
          redeemed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          grant_months?: number
          granted_by_subscription_id: string
          id?: string
          owner_user_id: string
          recipient_user_id?: string | null
          redeemed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          grant_months?: number
          granted_by_subscription_id?: string
          id?: string
          owner_user_id?: string
          recipient_user_id?: string | null
          redeemed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_update_logs: {
        Row: {
          created_at: string
          details: string | null
          id: string
          is_highlighted: boolean
          summary: string | null
          title: string
          version_tag: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          is_highlighted?: boolean
          summary?: string | null
          title: string
          version_tag: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          is_highlighted?: boolean
          summary?: string | null
          title?: string
          version_tag?: string
        }
        Relationships: []
      }
      talentos_disponiveis: {
        Row: {
          created_at: string
          descricao: string
          efeito: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          descricao: string
          efeito: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          descricao?: string
          efeito?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      talentos_jogador: {
        Row: {
          created_at: string
          equipped: boolean
          id: string
          personagem_id: string
          talento_id: string
        }
        Insert: {
          created_at?: string
          equipped?: boolean
          id?: string
          personagem_id: string
          talento_id: string
        }
        Update: {
          created_at?: string
          equipped?: boolean
          id?: string
          personagem_id?: string
          talento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talentos_jogador_talento_id_fkey"
            columns: ["talento_id"]
            isOneToOne: false
            referencedRelation: "talentos_disponiveis"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          claimed_at: string | null
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          claimed_at?: string | null
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          claimed_at?: string | null
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
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
      user_crafting_materials: {
        Row: {
          id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_health_stats: {
        Row: {
          created_at: string
          current_hp: number | null
          current_mp: number | null
          fatigue: number | null
          id: string
          last_reset_date: string | null
          last_wake_recovery_date: string | null
          max_hp: number | null
          max_mp: number | null
          meals_completed: number | null
          meals_target: number | null
          sleep_time: string | null
          updated_at: string
          user_id: string
          wake_time: string | null
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
          last_wake_recovery_date?: string | null
          max_hp?: number | null
          max_mp?: number | null
          meals_completed?: number | null
          meals_target?: number | null
          sleep_time?: string | null
          updated_at?: string
          user_id: string
          wake_time?: string | null
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
          last_wake_recovery_date?: string | null
          max_hp?: number | null
          max_mp?: number | null
          meals_completed?: number | null
          meals_target?: number | null
          sleep_time?: string | null
          updated_at?: string
          user_id?: string
          wake_time?: string | null
          water_completed_ml?: number | null
          water_target_ml?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      user_inventory: {
        Row: {
          equipped: boolean
          id: string
          item_id: string
          obtained_at: string
          quantity: number
          sintonizado: boolean
          user_id: string
        }
        Insert: {
          equipped?: boolean
          id?: string
          item_id: string
          obtained_at?: string
          quantity?: number
          sintonizado?: boolean
          user_id: string
        }
        Update: {
          equipped?: boolean
          id?: string
          item_id?: string
          obtained_at?: string
          quantity?: number
          sintonizado?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "game_items"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          atributos: Json | null
          created_at: string | null
          email: string
          id: number
          nivel_total: number | null
          rank: string | null
          username: string
          xp_hoje: number | null
          xp_total: number | null
        }
        Insert: {
          atributos?: Json | null
          created_at?: string | null
          email: string
          id?: number
          nivel_total?: number | null
          rank?: string | null
          username: string
          xp_hoje?: number | null
          xp_total?: number | null
        }
        Update: {
          atributos?: Json | null
          created_at?: string | null
          email?: string
          id?: number
          nivel_total?: number | null
          rank?: string | null
          username?: string
          xp_hoje?: number | null
          xp_total?: number | null
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
      xp_transactions: {
        Row: {
          created_at: string
          description: string | null
          gold_delta: number
          id: string
          local_date: string
          mission_id: string | null
          reason: string
          user_id: string
          xp_delta: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          gold_delta?: number
          id?: string
          local_date?: string
          mission_id?: string | null
          reason: string
          user_id: string
          xp_delta?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          gold_delta?: number
          id?: string
          local_date?: string
          mission_id?: string | null
          reason?: string
          user_id?: string
          xp_delta?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_mission_health_effects: {
        Args: {
          p_add_hp: number
          p_add_mp: number
          p_recover_pct: number
          p_uid: string
        }
        Returns: undefined
      }
      _consume_one_shot_buff: {
        Args: { p_effects: string[]; p_uid: string }
        Returns: undefined
      }
      _derive_mission_category: {
        Args: {
          p_attr_name: string
          p_category: string
          p_description: string
          p_title: string
        }
        Returns: string
      }
      _get_or_roll_portal_color: {
        Args: { p_event_id: string; p_uid: string }
        Returns: string
      }
      _global_offensive_streak: {
        Args: { p_today: string; p_uid: string }
        Returns: number
      }
      _grant_flow_xp_buff: { Args: { p_uid: string }; Returns: undefined }
      _grant_inspiration_if_perfect_day: {
        Args: { p_today: string; p_uid: string }
        Returns: boolean
      }
      _norm: { Args: { p: string }; Returns: string }
      _roll_portal_color: { Args: { p_level: number }; Returns: string }
      add_gold_to_user: {
        Args: { p_gold: number; p_user_id: string }
        Returns: undefined
      }
      add_xp_to_user: {
        Args: { p_user_id: string; p_xp: number }
        Returns: undefined
      }
      allocate_skill_node: { Args: { p_node_id: string }; Returns: Json }
      apply_xp_penalty: { Args: { p_amount: number }; Returns: undefined }
      buy_pet: { Args: { p_pet_type: string }; Returns: Json }
      buy_shop_item: {
        Args: { p_item_id: string; p_today: string }
        Returns: Json
      }
      charge_for_item: { Args: { p_item_id: string }; Returns: number }
      check_weekly_mission_failures: { Args: never; Returns: Json }
      claim_achievement: {
        Args: { p_user_achievement_id: string }
        Returns: {
          gold_reward: number
          xp_reward: number
        }[]
      }
      claim_onboarding_mission: {
        Args: { p_code: string }
        Returns: Json
      }
      claim_daily_bonus: { Args: { p_today: string }; Returns: Json }
      claim_health_challenge: { Args: never; Returns: Json }
      claim_pending_dungeon: { Args: never; Returns: Json }
      complete_co_op_mission: {
        Args: { p_mission_id: string }
        Returns: undefined
      }
      complete_mission: {
        Args: { p_mission_id: string }
        Returns: Json
      }
      complete_portal_run:
        | {
            Args: {
              p_event_id: string
              p_fragment_earned?: boolean
              p_gold_earned: number
              p_portal_color: string
              p_xp_earned: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_event_id: string
              p_gold_earned: number
              p_xp_earned: number
            }
            Returns: Json
          }
      create_co_op_mission: {
        Args: { p_description: string; p_member_ids: string[]; p_title: string }
        Returns: string
      }
      get_onboarding_missions: {
        Args: never
        Returns: {
          claimed: boolean
          claimed_at: string | null
          code: string
          reward_kind: string
          sort_order: number
          unlocked: boolean
          xp_reward: number
        }[]
      }
      create_dungeon_session: {
        Args: {
          p_current_hp: number
          p_display_name: string
          p_dungeon_id: string
          p_max_hp: number
          p_player_atk: number
          p_player_def: number
          p_player_level: number
        }
        Returns: {
          invite_code: string
          layout_index: number
          session_id: string
        }[]
      }
      create_event_session: {
        Args: {
          p_boss_id: string
          p_current_hp: number
          p_display_name: string
          p_max_hp: number
          p_player_atk: number
          p_player_def: number
          p_player_level: number
        }
        Returns: {
          invite_code: string
          layout_index: number
          session_id: string
        }[]
      }
      create_fragment_dungeon: {
        Args: {
          p_atk: number
          p_class?: string
          p_def: number
          p_display_name: string
          p_hp: number
          p_is_public: boolean
          p_level: number
          p_max_hp: number
          p_tier: string
        }
        Returns: Json
      }
      create_weekly_portal_event: { Args: never; Returns: string }
      debug_sintonizado: {
        Args: never
        Returns: {
          col_exists: boolean
          sample_value: boolean
        }[]
      }
      ensure_trial_subscription: { Args: never; Returns: undefined }
      generate_dungeon_invite_code: { Args: never; Returns: string }
      get_active_portal_event: {
        Args: never
        Returns: {
          already_completed: boolean
          color_revealed: boolean
          dungeon_expires_at: string
          ends_at: string
          event_id: string
          hours_left: number
          participant_count: number
          pending_dungeon: string
          portal_color: string
          runs_this_week: Json
          starts_at: string
        }[]
      }
      get_class_leaderboard: {
        Args: { p_class: string; p_limit?: number }
        Returns: {
          avatar_url: string
          current_class_name: string
          display_name: string
          level: number
          starter_class: string
          total_xp: number
          user_id: string
        }[]
      }
      get_dungeon_session_with_players: {
        Args: { p_session_id: string }
        Returns: {
          dungeon_id: string
          invite_code: string
          layout_index: number
          player_count: number
          players: Json
          session_id: string
          status: string
        }[]
      }
      get_global_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          current_class_name: string
          display_name: string
          level: number
          starter_class: string
          total_xp: number
          user_id: string
        }[]
      }
      get_level_from_xp: { Args: { p_xp: number }; Returns: number }
      get_level_from_xp_v2: { Args: { p_total_xp: number }; Returns: number }
      get_my_fragments: {
        Args: never
        Returns: {
          fragments: number
          lifetime_fragments: number
        }[]
      }
      get_my_partnerships: {
        Args: never
        Returns: {
          bond_tier: number
          drop_bonus_pct: number
          gold_bonus_pct: number
          last_dungeon_at: string
          partner_class: string
          partner_id: string
          partner_level: number
          partner_name: string
          runs_together: number
          victories_together: number
          xp_bonus_pct: number
        }[]
      }
      get_orphaned_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          level: number
          old_user_id: string
          total_xp: number
        }[]
      }
      get_public_fragment_dungeons: {
        Args: never
        Returns: {
          created_at: string
          dungeon_tier: string
          host_name: string
          invite_code: string
          max_players: number
          player_count: number
          session_id: string
        }[]
      }
      get_regional_class_leaderboard: {
        Args: { p_class: string; p_limit?: number; p_region: string }
        Returns: {
          avatar_url: string
          current_class_name: string
          display_name: string
          level: number
          starter_class: string
          total_xp: number
          user_id: string
        }[]
      }
      get_regional_leaderboard: {
        Args: { p_limit?: number; p_region: string }
        Returns: {
          avatar_url: string
          current_class_name: string
          display_name: string
          level: number
          starter_class: string
          total_xp: number
          user_id: string
        }[]
      }
      get_regional_weekly_leaderboard: {
        Args: { p_limit?: number; p_region: string }
        Returns: {
          avatar_url: string
          current_class_name: string
          display_name: string
          level: number
          starter_class: string
          total_xp: number
          user_id: string
          weekly_count: number
        }[]
      }
      get_weekly_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          current_class_name: string
          display_name: string
          level: number
          starter_class: string
          total_xp: number
          user_id: string
          weekly_count: number
        }[]
      }
      grant_starter_items: {
        Args: { p_class: string; p_user_id: string }
        Returns: undefined
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      is_system_admin: { Args: never; Returns: boolean }
      join_dungeon_session: {
        Args: {
          p_current_hp: number
          p_display_name: string
          p_invite_code: string
          p_max_hp: number
          p_player_atk: number
          p_player_def: number
          p_player_level: number
        }
        Returns: {
          dungeon_id: string
          host_name: string
          layout_index: number
          session_id: string
        }[]
      }
      join_fragment_dungeon: {
        Args: {
          p_atk: number
          p_class?: string
          p_def: number
          p_display_name: string
          p_hp: number
          p_invite_code: string
          p_level: number
          p_max_hp: number
        }
        Returns: Json
      }
      list_system_feedback_admin: {
        Args: never
        Returns: {
          created_at: string
          id: string
          message: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }[]
      }
      pay_mission_penalty: { Args: { p_mission_id: string }; Returns: Json }
      perform_class_respec: { Args: { target_class: string }; Returns: Json }
      record_dungeon_partnership: {
        Args: { p_player_ids: string[]; p_victory?: boolean }
        Returns: undefined
      }
      resolve_weekly_mission_failure: {
        Args: { p_mission_id: string; p_resolution: string }
        Returns: Json
      }
      redeem_access_key: { Args: { p_code: string }; Returns: Json }
      reset_skill_tree: { Args: never; Returns: Json }
      reset_weekly_portal_fragments: { Args: never; Returns: undefined }
      resolve_boss_battle: {
        Args: { p_boss_id: string; p_damage?: number; p_won: boolean }
        Returns: Json
      }
      scan_portal: { Args: { p_event_id: string }; Returns: Json }
      search_profiles: {
        Args: { p_exclude_id?: string; p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string
          display_name: string
          level: number
          starter_class: string
          user_id: string
        }[]
      }
      spend_gold: {
        Args: { p_amount: number; p_reason: string; p_type?: string }
        Returns: Json
      }
      start_dungeon_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      undo_mission: {
        Args: { p_mission_id: string; p_today: string }
        Returns: Json
      }
      undo_npc_challenge: {
        Args: { p_challenge_id: string; p_npc_id: string; p_week_token: string }
        Returns: Json
      }
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
