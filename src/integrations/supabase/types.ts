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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      company_profiles: {
        Row: {
          address: string | null
          brand_color: string | null
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_booth_sizes: string[] | null
          id: string
          industry: string | null
          logo_dark_url: string | null
          logo_url: string | null
          notes: string | null
          secondary_color: string | null
          tagline: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_booth_sizes?: string[] | null
          id?: string
          industry?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          notes?: string | null
          secondary_color?: string | null
          tagline?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_booth_sizes?: string[] | null
          id?: string
          industry?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          notes?: string | null
          secondary_color?: string | null
          tagline?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      knowledge_base_files: {
        Row: {
          created_at: string
          extracted_text: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          id: string
          project_id: string
          public_url: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          id?: string
          project_id: string
          public_url: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          id?: string
          project_id?: string
          public_url?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_images: {
        Row: {
          angle_id: string
          angle_name: string
          created_at: string
          id: string
          is_current: boolean
          project_id: string
          public_url: string
          storage_path: string
          user_id: string
        }
        Insert: {
          angle_id: string
          angle_name: string
          created_at?: string
          id?: string
          is_current?: boolean
          project_id: string
          public_url: string
          storage_path: string
          user_id: string
        }
        Update: {
          angle_id?: string
          angle_name?: string
          created_at?: string
          id?: string
          is_current?: boolean
          project_id?: string
          public_url?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          adjacent_activations: Json | null
          big_idea: Json | null
          brief_file_name: string | null
          brief_text: string | null
          budget_logic: Json | null
          created_at: string
          digital_storytelling: Json | null
          experience_framework: Json | null
          hero_prompt: string | null
          hero_style_confirmed: boolean | null
          human_connection: Json | null
          id: string
          interactive_mechanics: Json | null
          name: string
          parsed_brief: Json | null
          render_prompts: Json | null
          spatial_strategy: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adjacent_activations?: Json | null
          big_idea?: Json | null
          brief_file_name?: string | null
          brief_text?: string | null
          budget_logic?: Json | null
          created_at?: string
          digital_storytelling?: Json | null
          experience_framework?: Json | null
          hero_prompt?: string | null
          hero_style_confirmed?: boolean | null
          human_connection?: Json | null
          id?: string
          interactive_mechanics?: Json | null
          name: string
          parsed_brief?: Json | null
          render_prompts?: Json | null
          spatial_strategy?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adjacent_activations?: Json | null
          big_idea?: Json | null
          brief_file_name?: string | null
          brief_text?: string | null
          budget_logic?: Json | null
          created_at?: string
          digital_storytelling?: Json | null
          experience_framework?: Json | null
          hero_prompt?: string | null
          hero_style_confirmed?: boolean | null
          human_connection?: Json | null
          id?: string
          interactive_mechanics?: Json | null
          name?: string
          parsed_brief?: Json | null
          render_prompts?: Json | null
          spatial_strategy?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      show_costs: {
        Row: {
          badge_scan_cost: number | null
          city: string
          created_at: string
          estimated_booth_cost_per_sqft: number | null
          estimated_drayage_per_cwt: number | null
          estimated_electrical_per_outlet: number | null
          estimated_internet_cost: number | null
          estimated_labor_rate_per_hr: number | null
          estimated_lead_retrieval_cost: number | null
          id: string
          industry: string | null
          is_preset: boolean | null
          notes: string | null
          show_name: string
          union_labor_required: boolean | null
          updated_at: string
          user_id: string
          venue: string | null
        }
        Insert: {
          badge_scan_cost?: number | null
          city: string
          created_at?: string
          estimated_booth_cost_per_sqft?: number | null
          estimated_drayage_per_cwt?: number | null
          estimated_electrical_per_outlet?: number | null
          estimated_internet_cost?: number | null
          estimated_labor_rate_per_hr?: number | null
          estimated_lead_retrieval_cost?: number | null
          id?: string
          industry?: string | null
          is_preset?: boolean | null
          notes?: string | null
          show_name: string
          union_labor_required?: boolean | null
          updated_at?: string
          user_id: string
          venue?: string | null
        }
        Update: {
          badge_scan_cost?: number | null
          city?: string
          created_at?: string
          estimated_booth_cost_per_sqft?: number | null
          estimated_drayage_per_cwt?: number | null
          estimated_electrical_per_outlet?: number | null
          estimated_internet_cost?: number | null
          estimated_labor_rate_per_hr?: number | null
          estimated_lead_retrieval_cost?: number | null
          id?: string
          industry?: string | null
          is_preset?: boolean | null
          notes?: string | null
          show_name?: string
          union_labor_required?: boolean | null
          updated_at?: string
          user_id?: string
          venue?: string | null
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
