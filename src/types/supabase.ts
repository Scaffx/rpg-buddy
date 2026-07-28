// src/types/supabase.ts
import type { MissionCategory, MissionDailyStatus, MissionFrequencyType, MissionPriority, MissionStatus, Weekday } from './missions'

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
          anchor: string | null
          is_anchor: boolean
          frequency_type: MissionFrequencyType
          weekly_started_at: string | null
          target_count: number | null
          max_count: number | null
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
          anchor?: string | null
          is_anchor?: boolean
          frequency_type?: MissionFrequencyType
          weekly_started_at?: string | null
          target_count?: number | null
          max_count?: number | null
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
          anchor?: string | null
          is_anchor?: boolean
          frequency_type?: MissionFrequencyType
          weekly_started_at?: string | null
          target_count?: number | null
          max_count?: number | null
        }
      }
      reminders: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          remind_at: string
          recurrence_type: 'once' | 'weekly'
          days_of_week: number[]
          starts_on: string | null
          ends_on: string | null
          remind_time: string | null
          timezone: string
          notified_at: string | null
          dismissed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          title: string
          description?: string | null
          remind_at: string
          recurrence_type?: 'once' | 'weekly'
          days_of_week?: number[]
          starts_on?: string | null
          ends_on?: string | null
          remind_time?: string | null
          timezone?: string
          notified_at?: string | null
          dismissed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          remind_at?: string
          recurrence_type?: 'once' | 'weekly'
          days_of_week?: number[]
          starts_on?: string | null
          ends_on?: string | null
          remind_time?: string | null
          timezone?: string
          notified_at?: string | null
          dismissed_at?: string | null
          created_at?: string
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
      mission_weekly_progress: {
        Row: {
          id: string
          mission_id: string
          user_id: string
          week_start: string
          current_count: number
          milestone_paid: boolean
          last_completed_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          user_id: string
          week_start: string
          current_count?: number
          milestone_paid?: boolean
          last_completed_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          current_count?: number
          milestone_paid?: boolean
          last_completed_date?: string | null
          updated_at?: string
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
