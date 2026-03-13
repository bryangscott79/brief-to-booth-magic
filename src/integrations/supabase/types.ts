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
      brand_intelligence: {
        Row: {
          approved_at: string | null
          category: string
          client_id: string
          confidence_score: number | null
          content: string
          created_at: string
          id: string
          is_approved: boolean
          source: string
          source_project_id: string | null
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          category: string
          client_id: string
          confidence_score?: number | null
          content: string
          created_at?: string
          id?: string
          is_approved?: boolean
          source?: string
          source_project_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          category?: string
          client_id?: string
          confidence_score?: number | null
          content?: string
          created_at?: string
          id?: string
          is_approved?: boolean
          source?: string
          source_project_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_intelligence_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          description: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
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
      team_members: {
        Row: {
          id: string
          user_id: string
          team_owner_id: string
          role: string
          display_name: string
          invited_email: string | null
          invited_by: string | null
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          team_owner_id: string
          role: string
          display_name: string
          invited_email?: string | null
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          team_owner_id?: string
          role?: string
          display_name?: string
          invited_email?: string | null
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      project_invites: {
        Row: {
          id: string
          project_id: string
          created_by: string
          token: string
          email: string | null
          scope: string
          label: string | null
          expires_at: string
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          created_by: string
          token?: string
          email?: string | null
          scope: string
          label?: string | null
          expires_at: string
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          created_by?: string
          token?: string
          email?: string | null
          scope?: string
          label?: string | null
          expires_at?: string
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rhino_renders: {
        Row: {
          id: string
          project_id: string
          user_id: string
          original_storage_path: string
          original_public_url: string
          polished_storage_path: string | null
          polished_public_url: string | null
          polish_status: string
          polish_prompt: string | null
          polish_feedback: string | null
          view_name: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          original_storage_path: string
          original_public_url: string
          polished_storage_path?: string | null
          polished_public_url?: string | null
          polish_status?: string
          polish_prompt?: string | null
          polish_feedback?: string | null
          view_name?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          original_storage_path?: string
          original_public_url?: string
          polished_storage_path?: string | null
          polished_public_url?: string | null
          polish_status?: string
          polish_prompt?: string | null
          polish_feedback?: string | null
          view_name?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rhino_renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_type_configs: {
        Row: {
          cost_category_overrides: Json | null
          created_at: string
          description: string | null
          element_overrides: Json | null
          id: string
          is_enabled: boolean
          label: string | null
          project_type_id: string
          render_context: string | null
          sort_order: number
          tagline: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_category_overrides?: Json | null
          created_at?: string
          description?: string | null
          element_overrides?: Json | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          project_type_id: string
          render_context?: string | null
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_category_overrides?: Json | null
          created_at?: string
          description?: string | null
          element_overrides?: Json | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          project_type_id?: string
          render_context?: string | null
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          adjacent_activations: Json | null
          big_idea: Json | null
          brief_file_name: string | null
          brief_file_url: string | null
          brief_text: string | null
          budget_logic: Json | null
          client_id: string | null
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
          project_type: string
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
          brief_file_url?: string | null
          brief_text?: string | null
          budget_logic?: Json | null
          client_id?: string | null
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
          project_type?: string
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
          brief_file_url?: string | null
          brief_text?: string | null
          budget_logic?: Json | null
          client_id?: string | null
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
          project_type?: string
          render_prompts?: Json | null
          spatial_strategy?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
