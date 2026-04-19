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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      activation_types: {
        Row: {
          category: string
          created_at: string | null
          default_scale: string | null
          default_sqft: number | null
          description: string | null
          element_emphasis: Json | null
          icon: string | null
          id: string
          is_builtin: boolean | null
          label: string
          parent_type_affinity: string[] | null
          render_context_override: string | null
          slug: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          default_scale?: string | null
          default_sqft?: number | null
          description?: string | null
          element_emphasis?: Json | null
          icon?: string | null
          id?: string
          is_builtin?: boolean | null
          label: string
          parent_type_affinity?: string[] | null
          render_context_override?: string | null
          slug: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          default_scale?: string | null
          default_sqft?: number | null
          description?: string | null
          element_emphasis?: Json | null
          icon?: string | null
          id?: string
          is_builtin?: boolean | null
          label?: string
          parent_type_affinity?: string[] | null
          render_context_override?: string | null
          slug?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agencies: {
        Row: {
          created_at: string
          default_booth_sizes: string | null
          id: string
          industry: string | null
          logo_dark_url: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          primary_owner_id: string
          secondary_color: string | null
          settings: Json
          slug: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_booth_sizes?: string | null
          id?: string
          industry?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          primary_owner_id: string
          secondary_color?: string | null
          settings?: Json
          slug?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_booth_sizes?: string | null
          id?: string
          industry?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          primary_owner_id?: string
          secondary_color?: string | null
          settings?: Json
          slug?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agency_members: {
        Row: {
          agency_id: string
          id: string
          invited_by: string | null
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          agency_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          asset_type: string
          client_id: string
          created_at: string | null
          file_type: string | null
          id: string
          label: string
          metadata: Json | null
          public_url: string
          storage_path: string
          user_id: string
        }
        Insert: {
          asset_type: string
          client_id: string
          created_at?: string | null
          file_type?: string | null
          id?: string
          label: string
          metadata?: Json | null
          public_url: string
          storage_path: string
          user_id: string
        }
        Update: {
          asset_type?: string
          client_id?: string
          created_at?: string | null
          file_type?: string | null
          id?: string
          label?: string
          metadata?: Json | null
          public_url?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_guidelines: {
        Row: {
          client_id: string
          color_system: Json | null
          created_at: string | null
          guidelines_version: string | null
          id: string
          logo_rules: Json | null
          materials_finishes: Json | null
          photography_style: Json | null
          tone_of_voice: Json | null
          typography: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          color_system?: Json | null
          created_at?: string | null
          guidelines_version?: string | null
          id?: string
          logo_rules?: Json | null
          materials_finishes?: Json | null
          photography_style?: Json | null
          tone_of_voice?: Json | null
          typography?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          color_system?: Json | null
          created_at?: string | null
          guidelines_version?: string | null
          id?: string
          logo_rules?: Json | null
          materials_finishes?: Json | null
          photography_style?: Json | null
          tone_of_voice?: Json | null
          typography?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_guidelines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_intelligence: {
        Row: {
          category: string
          created_at: string | null
          id: string
          key: string
          metadata: Json | null
          project_id: string | null
          relevance_weight: number | null
          source: string | null
          updated_at: string | null
          user_id: string
          value: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          key: string
          metadata?: Json | null
          project_id?: string | null
          relevance_weight?: number | null
          source?: string | null
          updated_at?: string | null
          user_id: string
          value: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          key?: string
          metadata?: Json | null
          project_id?: string | null
          relevance_weight?: number | null
          source?: string | null
          updated_at?: string | null
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_intelligence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_id: string | null
          created_at: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          notes: string | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          agency_id?: string | null
          created_at?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          agency_id?: string | null
          created_at?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          booth_size: string
          client: string
          created_at: string
          id: string
          name: string
          show_city: string
          show_date: string
          show_name: string
          status: string
        }
        Insert: {
          booth_size: string
          client: string
          created_at?: string
          id?: string
          name: string
          show_city: string
          show_date: string
          show_name: string
          status: string
        }
        Update: {
          booth_size?: string
          client?: string
          created_at?: string
          id?: string
          name?: string
          show_city?: string
          show_date?: string
          show_name?: string
          status?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          agency_id: string
          chunk_index: number
          content: string
          content_tsv: unknown
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json
          scope: string
          scope_id: string
          token_count: number | null
        }
        Insert: {
          agency_id: string
          chunk_index: number
          content: string
          content_tsv?: unknown
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json
          scope: string
          scope_id: string
          token_count?: number | null
        }
        Update: {
          agency_id?: string
          chunk_index?: number
          content?: string
          content_tsv?: unknown
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          scope?: string
          scope_id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          agency_id: string
          auto_tags: string[]
          chunk_count: number
          created_at: string
          doc_type: string | null
          extracted_text: string | null
          file_size_bytes: number | null
          filename: string
          id: string
          metadata: Json
          mime_type: string | null
          processing_error: string | null
          scope: string
          scope_id: string
          status: string
          storage_bucket: string
          storage_path: string
          summary: string | null
          title: string | null
          updated_at: string
          uploaded_by: string
          user_tags: string[]
        }
        Insert: {
          agency_id: string
          auto_tags?: string[]
          chunk_count?: number
          created_at?: string
          doc_type?: string | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          filename: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          processing_error?: string | null
          scope: string
          scope_id: string
          status?: string
          storage_bucket?: string
          storage_path: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by: string
          user_tags?: string[]
        }
        Update: {
          agency_id?: string
          auto_tags?: string[]
          chunk_count?: number
          created_at?: string
          doc_type?: string | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          filename?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          processing_error?: string | null
          scope?: string
          scope_id?: string
          status?: string
          storage_bucket?: string
          storage_path?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string
          user_tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      parsed_bills: {
        Row: {
          applied: boolean
          file_name: string | null
          file_path: string | null
          id: string
          invoice_number: string | null
          job_id: string
          parsed_at: string
          raw_text: string | null
          show_name: string | null
          total: number | null
          vendor: string
        }
        Insert: {
          applied?: boolean
          file_name?: string | null
          file_path?: string | null
          id?: string
          invoice_number?: string | null
          job_id: string
          parsed_at?: string
          raw_text?: string | null
          show_name?: string | null
          total?: number | null
          vendor: string
        }
        Update: {
          applied?: boolean
          file_name?: string | null
          file_path?: string | null
          id?: string
          invoice_number?: string | null
          job_id?: string
          parsed_at?: string
          raw_text?: string | null
          show_name?: string | null
          total?: number | null
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "parsed_bills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      parsed_line_items: {
        Row: {
          amount: number | null
          bill_id: string
          description: string
          id: string
          pi_category: string | null
        }
        Insert: {
          amount?: number | null
          bill_id: string
          description: string
          id?: string
          pi_category?: string | null
        }
        Update: {
          amount?: number | null
          bill_id?: string
          description?: string
          id?: string
          pi_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parsed_line_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "parsed_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agency_id: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invite_type: string
          invited_by: string
          role: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invite_type: string
          invited_by: string
          role?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invite_type?: string
          invited_by?: string
          role?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_executive: string | null
          activation_type: string | null
          agency_id: string | null
          booth_size: string
          booth_style: string
          budget: Json | null
          client_id: string | null
          client_logo: string | null
          client_name: string
          completion: string | null
          created_at: string
          description: string | null
          design_start: string | null
          event_dates: string | null
          files: Json | null
          footprint_sqft: number | null
          id: string
          industry: string
          inherits_brand: boolean | null
          inherits_brief: boolean | null
          job_number: string
          milestones: Json | null
          parent_id: string | null
          project_manager: string | null
          project_title: string
          related_projects: string[] | null
          scale_classification: string | null
          show_name: string
          sort_order: number | null
          specifications: Json | null
          status: string
          suite_notes: string | null
          tags: string[] | null
          team: Json | null
          thumbnail: string | null
          total_value: number
          updated_at: string
          user_id: string | null
          venue: string
          year: number
        }
        Insert: {
          account_executive?: string | null
          activation_type?: string | null
          agency_id?: string | null
          booth_size: string
          booth_style: string
          budget?: Json | null
          client_id?: string | null
          client_logo?: string | null
          client_name: string
          completion?: string | null
          created_at?: string
          description?: string | null
          design_start?: string | null
          event_dates?: string | null
          files?: Json | null
          footprint_sqft?: number | null
          id?: string
          industry: string
          inherits_brand?: boolean | null
          inherits_brief?: boolean | null
          job_number: string
          milestones?: Json | null
          parent_id?: string | null
          project_manager?: string | null
          project_title: string
          related_projects?: string[] | null
          scale_classification?: string | null
          show_name: string
          sort_order?: number | null
          specifications?: Json | null
          status?: string
          suite_notes?: string | null
          tags?: string[] | null
          team?: Json | null
          thumbnail?: string | null
          total_value?: number
          updated_at?: string
          user_id?: string | null
          venue: string
          year: number
        }
        Update: {
          account_executive?: string | null
          activation_type?: string | null
          agency_id?: string | null
          booth_size?: string
          booth_style?: string
          budget?: Json | null
          client_id?: string | null
          client_logo?: string | null
          client_name?: string
          completion?: string | null
          created_at?: string
          description?: string | null
          design_start?: string | null
          event_dates?: string | null
          files?: Json | null
          footprint_sqft?: number | null
          id?: string
          industry?: string
          inherits_brand?: boolean | null
          inherits_brief?: boolean | null
          job_number?: string
          milestones?: Json | null
          parent_id?: string | null
          project_manager?: string | null
          project_title?: string
          related_projects?: string[] | null
          scale_classification?: string | null
          show_name?: string
          sort_order?: number | null
          specifications?: Json | null
          status?: string
          suite_notes?: string | null
          tags?: string[] | null
          team?: Json | null
          thumbnail?: string | null
          total_value?: number
          updated_at?: string
          user_id?: string | null
          venue?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      recon_lines: {
        Row: {
          actual_cost: number | null
          created_at: string
          est_cost: number | null
          est_sell: number | null
          full_markup: number | null
          id: string
          job_id: string
          pi_category: string
          pi_item: string
          sell_price: number | null
          sort_order: number
          vendor: string
        }
        Insert: {
          actual_cost?: number | null
          created_at?: string
          est_cost?: number | null
          est_sell?: number | null
          full_markup?: number | null
          id?: string
          job_id: string
          pi_category: string
          pi_item: string
          sell_price?: number | null
          sort_order?: number
          vendor: string
        }
        Update: {
          actual_cost?: number | null
          created_at?: string
          est_cost?: number | null
          est_sell?: number | null
          full_markup?: number | null
          id?: string
          job_id?: string
          pi_category?: string
          pi_item?: string
          sell_price?: number | null
          sort_order?: number
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "recon_lines_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_intelligence: {
        Row: {
          audience_notes: string | null
          booth_placement_tips: string | null
          city: string | null
          created_at: string | null
          design_tips: string[] | null
          id: string
          industry: string | null
          logistics_notes: string | null
          show_name: string
          source: string | null
          source_project_id: string | null
          traffic_patterns: string | null
          typical_booth_sizes: string[] | null
          union_labor_required: boolean | null
          updated_at: string | null
          user_id: string
          venue: string | null
        }
        Insert: {
          audience_notes?: string | null
          booth_placement_tips?: string | null
          city?: string | null
          created_at?: string | null
          design_tips?: string[] | null
          id?: string
          industry?: string | null
          logistics_notes?: string | null
          show_name: string
          source?: string | null
          source_project_id?: string | null
          traffic_patterns?: string | null
          typical_booth_sizes?: string[] | null
          union_labor_required?: boolean | null
          updated_at?: string | null
          user_id: string
          venue?: string | null
        }
        Update: {
          audience_notes?: string | null
          booth_placement_tips?: string | null
          city?: string | null
          created_at?: string | null
          design_tips?: string[] | null
          id?: string
          industry?: string | null
          logistics_notes?: string | null
          show_name?: string
          source?: string | null
          source_project_id?: string | null
          traffic_patterns?: string | null
          typical_booth_sizes?: string[] | null
          union_labor_required?: boolean | null
          updated_at?: string | null
          user_id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_intelligence_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pending_invite: { Args: { _invite_id: string }; Returns: boolean }
      current_agency_id: { Args: never; Returns: string }
      has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_agency_admin: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      is_agency_member: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_agency_members: {
        Args: { _agency_id: string }
        Returns: {
          email: string
          id: string
          is_primary_owner: boolean
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      list_super_admins: {
        Args: never
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          _agency_id: string
          _match_count?: number
          _query_embedding: string
          _query_text: string
          _scope_ids?: string[]
          _scopes?: string[]
          _vector_weight?: number
        }
        Returns: {
          bm25_score: number
          chunk_id: string
          content: string
          document_id: string
          hybrid_score: number
          metadata: Json
          scope: string
          scope_id: string
          similarity: number
        }[]
      }
      my_pending_invites: {
        Args: never
        Returns: {
          agency_id: string
          agency_name: string
          created_at: string
          expires_at: string
          id: string
          invite_type: string
          invited_by: string
          role: string
        }[]
      }
      revoke_super_admin: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
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
