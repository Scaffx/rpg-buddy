// src/types/supabase.ts
import type { MissionCategory, MissionDailyStatus, MissionPriority, MissionStatus, Weekday } from './missions'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      missions: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          attribute_id: string
          secondary_attribute_ids: string[] | null
          xp_reward: number
          priority: MissionPriority
          status: MissionStatus
          completed: boolean
          completed_at: string | null
          days_of_week: Weekday[] | null
          daily_status: MissionDailyStatus | null
          mission_category: MissionCategory | null
          horario_provavel: string | null
          notes: string | null
          created_at: string
          updated_at: string
          failed_date: string | null
          due_date: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          attribute_id: string
          secondary_attribute_ids?: string[] | null
          xp_reward?: number
          priority?: MissionPriority
          status?: MissionStatus
          completed?: boolean
          completed_at?: string | null
          days_of_week?: Weekday[] | null
          daily_status?: MissionDailyStatus | null
          mission_category?: MissionCategory | null
          horario_provavel?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          failed_date?: string | null
          due_date?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          attribute_id?: string
          secondary_attribute_ids?: string[] | null
          xp_reward?: number
          priority?: MissionPriority
          status?: MissionStatus
          completed?: boolean
          completed_at?: string | null
          days_of_week?: Weekday[] | null
          daily_status?: MissionDailyStatus | null
          mission_category?: MissionCategory | null
          horario_provavel?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          failed_date?: string | null
          due_date?: string | null
        }
      }
      mission_daily_completions: { // ✅ NOVA TABELA
        Row: {
          id: string
          mission_id: string
          completion_date: string
          xp_earned: number
          gold_earned: number
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          completion_date: string
          xp_earned: number
          gold_earned?: number
          created_at?: string
        }
        Update: {
          id?: string
          mission_id?: string
          completion_date?: string
          xp_earned?: number
          gold_earned?: number
          created_at?: string
        }
      }
      // ... outras tabelas existentes
    }
    Views: {
      // ... suas views
    }
    Functions: {
      // ... suas functions
    }
    Enums: {
      // ... seus enums
    }
  }
}