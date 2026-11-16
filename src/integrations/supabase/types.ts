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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          details: Json | null
          id: string
          timestamp: string
          user_id: string
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          timestamp?: string
          user_id: string
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      disease_predictions: {
        Row: {
          created_at: string
          disease_name: string
          id: string
          prediction_id: string
          risk_score: number
        }
        Insert: {
          created_at?: string
          disease_name: string
          id?: string
          prediction_id: string
          risk_score: number
        }
        Update: {
          created_at?: string
          disease_name?: string
          id?: string
          prediction_id?: string
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "disease_predictions_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "risk_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      health_measurements: {
        Row: {
          created_at: string
          id: string
          measurement_date: string
          measurement_type: string
          patient_id: string
          unit: string | null
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          measurement_date?: string
          measurement_type: string
          patient_id: string
          unit?: string | null
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          measurement_date?: string
          measurement_type?: string
          patient_id?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_measurements_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      nlp_reports: {
        Row: {
          confidence: number | null
          created_at: string
          engine: string
          entity_count: number | null
          error_message: string | null
          file_name: string
          file_size_bytes: number
          file_type: string
          id: string
          risk_factor_count: number | null
          status: string
          user_id: string
          word_count: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          engine: string
          entity_count?: number | null
          error_message?: string | null
          file_name: string
          file_size_bytes: number
          file_type: string
          id?: string
          risk_factor_count?: number | null
          status?: string
          user_id: string
          word_count?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          engine?: string
          entity_count?: number | null
          error_message?: string | null
          file_name?: string
          file_size_bytes?: number
          file_type?: string
          id?: string
          risk_factor_count?: number | null
          status?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      patients: {
        Row: {
          age: number
          blood_pressure: string | null
          bmi: number | null
          cholesterol: number | null
          created_at: string
          exercise_level: string | null
          family_history: boolean
          gender: string
          glucose: number | null
          heart_rate: number | null
          height_cm: number | null
          id: string
          patient_code: string
          smoking_status: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          age: number
          blood_pressure?: string | null
          bmi?: number | null
          cholesterol?: number | null
          created_at?: string
          exercise_level?: string | null
          family_history?: boolean
          gender: string
          glucose?: number | null
          heart_rate?: number | null
          height_cm?: number | null
          id?: string
          patient_code: string
          smoking_status?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          age?: number
          blood_pressure?: string | null
          bmi?: number | null
          cholesterol?: number | null
          created_at?: string
          exercise_level?: string | null
          family_history?: boolean
          gender?: string
          glucose?: number | null
          heart_rate?: number | null
          height_cm?: number | null
          id?: string
          patient_code?: string
          smoking_status?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      risk_predictions: {
        Row: {
          created_at: string
          id: string
          model_name: string
          overall_risk: number
          patient_id: string
          prediction_date: string
          risk_level: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_name?: string
          overall_risk: number
          patient_id: string
          prediction_date?: string
          risk_level: string
        }
        Update: {
          created_at?: string
          id?: string
          model_name?: string
          overall_risk?: number
          patient_id?: string
          prediction_date?: string
          risk_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_predictions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "researcher" | "analyst"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "researcher", "analyst"],
    },
  },
} as const
