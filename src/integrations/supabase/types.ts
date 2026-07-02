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
      activation_type_kb_files: {
        Row: {
          activation_type_id: string
          created_at: string
          doc_type: string
          extracted_text: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          folder: string
          id: string
          last_reviewed_at: string | null
          layer: string
          public_url: string
          scope: string
          storage_path: string
          topics: string[] | null
          user_id: string
        }
        Insert: {
          activation_type_id: string
          created_at?: string
          doc_type?: string
          extracted_text?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          folder?: string
          id?: string
          last_reviewed_at?: string | null
          layer?: string
          public_url: string
          scope?: string
          storage_path: string
          topics?: string[] | null
          user_id: string
        }
        Update: {
          activation_type_id?: string
          created_at?: string
          doc_type?: string
          extracted_text?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          folder?: string
          id?: string
          last_reviewed_at?: string | null
          layer?: string
          public_url?: string
          scope?: string
          storage_path?: string
          topics?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_type_kb_files_activation_type_id_fkey"
            columns: ["activation_type_id"]
            isOneToOne: false
            referencedRelation: "activation_types"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_type_overrides: {
        Row: {
          activation_type_id: string
          agency_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          template: Json
          updated_at: string
        }
        Insert: {
          activation_type_id: string
          agency_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          template?: Json
          updated_at?: string
        }
        Update: {
          activation_type_id?: string
          agency_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          template?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_type_overrides_activation_type_id_fkey"
            columns: ["activation_type_id"]
            isOneToOne: false
            referencedRelation: "activation_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_type_overrides_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_types: {
        Row: {
          category: string
          created_at: string
          default_scale: string | null
          default_sqft: number | null
          description: string | null
          element_emphasis: Json | null
          icon: string | null
          id: string
          industries: string[]
          is_builtin: boolean
          label: string
          parent_type_affinity: string[]
          render_context_override: string | null
          slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          default_scale?: string | null
          default_sqft?: number | null
          description?: string | null
          element_emphasis?: Json | null
          icon?: string | null
          id?: string
          industries?: string[]
          is_builtin?: boolean
          label: string
          parent_type_affinity?: string[]
          render_context_override?: string | null
          slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          default_scale?: string | null
          default_sqft?: number | null
          description?: string | null
          element_emphasis?: Json | null
          icon?: string | null
          id?: string
          industries?: string[]
          is_builtin?: boolean
          label?: string
          parent_type_affinity?: string[]
          render_context_override?: string | null
          slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agencies: {
        Row: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          access_status?: string
          admin_notes?: string | null
          brand_colors?: Json | null
          created_at?: string
          feature_flags?: Json
          id?: string
          image_model?: string
          industries?: string[]
          logo_url?: string | null
          name: string
          owner_user_id: string
          primary_industry?: string | null
          quotas?: Json
          slug: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          access_status?: string
          admin_notes?: string | null
          brand_colors?: Json | null
          created_at?: string
          feature_flags?: Json
          id?: string
          image_model?: string
          industries?: string[]
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          primary_industry?: string | null
          quotas?: Json
          slug?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agency_access_log: {
        Row: {
          action: string
          after_state: Json | null
          agency_id: string
          before_state: Json | null
          created_at: string
          id: string
          metadata: Json
          performed_by: string | null
          reason: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          agency_id: string
          before_state?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          performed_by?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          agency_id?: string
          before_state?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          performed_by?: string | null
          reason?: string | null
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
      ai_usage_events: {
        Row: {
          agency_id: string | null
          cost_usd: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          feature: string
          id: string
          input_tokens: number
          metadata: Json
          model: string
          output_tokens: number
          project_id: string | null
          provider: string | null
          status: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          agency_id?: string | null
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          feature: string
          id?: string
          input_tokens?: number
          metadata?: Json
          model: string
          output_tokens?: number
          project_id?: string | null
          provider?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          agency_id?: string | null
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          feature?: string
          id?: string
          input_tokens?: number
          metadata?: Json
          model?: string
          output_tokens?: number
          project_id?: string | null
          provider?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      brand_guidelines: {
        Row: {
          client_id: string
          color_system: Json | null
          created_at: string
          guidelines_version: string | null
          id: string
          logo_rules: Json | null
          materials_finishes: Json | null
          photography_style: Json | null
          tone_of_voice: Json | null
          typography: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          color_system?: Json | null
          created_at?: string
          guidelines_version?: string | null
          id?: string
          logo_rules?: Json | null
          materials_finishes?: Json | null
          photography_style?: Json | null
          tone_of_voice?: Json | null
          typography?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          color_system?: Json | null
          created_at?: string
          guidelines_version?: string | null
          id?: string
          logo_rules?: Json | null
          materials_finishes?: Json | null
          photography_style?: Json | null
          tone_of_voice?: Json | null
          typography?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          agency_id: string | null
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
          agency_id?: string | null
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
          agency_id?: string | null
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
      custom_project_types: {
        Row: {
          accent_color: string | null
          confirmed_by_user: boolean
          created_at: string
          default_size: number | null
          description: string | null
          icon: string | null
          id: string
          is_ai_detected: boolean
          label: string
          render_context: string | null
          short_label: string | null
          source_brief_id: string | null
          spatial_unit: string | null
          tagline: string | null
          type_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          confirmed_by_user?: boolean
          created_at?: string
          default_size?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_ai_detected?: boolean
          label: string
          render_context?: string | null
          short_label?: string | null
          source_brief_id?: string | null
          spatial_unit?: string | null
          tagline?: string | null
          type_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          confirmed_by_user?: boolean
          created_at?: string
          default_size?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_ai_detected?: boolean
          label?: string
          render_context?: string | null
          short_label?: string | null
          source_brief_id?: string | null
          spatial_unit?: string | null
          tagline?: string | null
          type_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_project_types_source_brief_id_fkey"
            columns: ["source_brief_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_builtin: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
          vocabulary: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_builtin?: boolean
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
          vocabulary?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_builtin?: boolean
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          vocabulary?: Json
        }
        Relationships: []
      }
      kb_migration_log: {
        Row: {
          created_at: string
          document_id: string | null
          error: string | null
          id: string
          source_row_id: string
          source_table: string
          status: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          error?: string | null
          id?: string
          source_row_id: string
          source_table: string
          status?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          error?: string | null
          id?: string
          source_row_id?: string
          source_table?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_migration_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_files: {
        Row: {
          created_at: string
          doc_type: string
          extracted_text: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          folder: string
          id: string
          last_reviewed_at: string | null
          layer: string
          project_id: string
          public_url: string
          scope: string
          storage_path: string
          topics: string[] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_type?: string
          extracted_text?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          folder?: string
          id?: string
          last_reviewed_at?: string | null
          layer?: string
          project_id: string
          public_url: string
          scope?: string
          storage_path: string
          topics?: string[] | null
          user_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          extracted_text?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          folder?: string
          id?: string
          last_reviewed_at?: string | null
          layer?: string
          project_id?: string
          public_url?: string
          scope?: string
          storage_path?: string
          topics?: string[] | null
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
      knowledge_chunks: {
        Row: {
          agency_id: string | null
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          scope: string
          scope_id: string
          token_count: number | null
        }
        Insert: {
          agency_id?: string | null
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          scope: string
          scope_id: string
          token_count?: number | null
        }
        Update: {
          agency_id?: string | null
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
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
          agency_id: string | null
          auto_tags: string[]
          chunk_count: number
          created_at: string
          doc_type: string | null
          extracted_text: string | null
          file_size_bytes: number | null
          filename: string
          id: string
          is_pinned: boolean
          metadata: Json | null
          mime_type: string | null
          priority_weight: number
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
          agency_id?: string | null
          auto_tags?: string[]
          chunk_count?: number
          created_at?: string
          doc_type?: string | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          filename: string
          id?: string
          is_pinned?: boolean
          metadata?: Json | null
          mime_type?: string | null
          priority_weight?: number
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
          agency_id?: string | null
          auto_tags?: string[]
          chunk_count?: number
          created_at?: string
          doc_type?: string | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          filename?: string
          id?: string
          is_pinned?: boolean
          metadata?: Json | null
          mime_type?: string | null
          priority_weight?: number
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
      pending_invites: {
        Row: {
          accepted_at: string | null
          agency_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_type: string
          invited_by: string
          role: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invite_type: string
          invited_by: string
          role?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
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
      plan_items: {
        Row: {
          agency_id: string
          category: string | null
          created_at: string
          created_by: string | null
          csi_division: string | null
          description: string
          id: string
          item_key: string
          manufacturer: string | null
          metadata: Json
          model_number: string | null
          notes: string | null
          override_currency: string | null
          override_reason: string | null
          override_unit_price: number | null
          position: Json | null
          project_id: string
          quality_tier: string
          quantity: number
          uniformat_class: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          csi_division?: string | null
          description: string
          id?: string
          item_key: string
          manufacturer?: string | null
          metadata?: Json
          model_number?: string | null
          notes?: string | null
          override_currency?: string | null
          override_reason?: string | null
          override_unit_price?: number | null
          position?: Json | null
          project_id: string
          quality_tier?: string
          quantity?: number
          uniformat_class?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          csi_division?: string | null
          description?: string
          id?: string
          item_key?: string
          manufacturer?: string | null
          metadata?: Json
          model_number?: string | null
          notes?: string | null
          override_currency?: string | null
          override_reason?: string | null
          override_unit_price?: number | null
          position?: Json | null
          project_id?: string
          quality_tier?: string
          quantity?: number
          uniformat_class?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
        }
        Relationships: []
      }
      pricing_quotes: {
        Row: {
          agency_id: string | null
          confidence: string
          created_at: string
          currency: string
          fetched_at: string
          id: string
          item_key: string
          label: string | null
          manufacturer: string | null
          metadata: Json
          model_number: string | null
          notes: string | null
          quality_tier: string
          region: string | null
          source_id: string
          source_url: string | null
          unit: string
          unit_price: number
          valid_until: string | null
        }
        Insert: {
          agency_id?: string | null
          confidence?: string
          created_at?: string
          currency?: string
          fetched_at?: string
          id?: string
          item_key: string
          label?: string | null
          manufacturer?: string | null
          metadata?: Json
          model_number?: string | null
          notes?: string | null
          quality_tier?: string
          region?: string | null
          source_id: string
          source_url?: string | null
          unit: string
          unit_price: number
          valid_until?: string | null
        }
        Update: {
          agency_id?: string | null
          confidence?: string
          created_at?: string
          currency?: string
          fetched_at?: string
          id?: string
          item_key?: string
          label?: string | null
          manufacturer?: string | null
          metadata?: Json
          model_number?: string | null
          notes?: string | null
          quality_tier?: string
          region?: string | null
          source_id?: string
          source_url?: string | null
          unit?: string
          unit_price?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_quotes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_quotes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "pricing_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_sources: {
        Row: {
          agency_id: string | null
          config: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_refreshed_at: string | null
          region: string | null
          source_type: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          agency_id?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string | null
          region?: string | null
          source_type: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          agency_id?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string | null
          region?: string | null
          source_type?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_sources_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_images: {
        Row: {
          angle_id: string
          angle_name: string
          created_at: string
          id: string
          is_current: boolean
          project_id: string
          prompt_artifacts: Json | null
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
          prompt_artifacts?: Json | null
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
          prompt_artifacts?: Json | null
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
      project_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          label: string | null
          project_id: string
          scope: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at: string
          id?: string
          label?: string | null
          project_id: string
          scope?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          project_id?: string
          scope?: string
          token?: string
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
          activation_type: string | null
          adjacent_activations: Json | null
          big_idea: Json | null
          brand_website_url: string | null
          brief_file_name: string | null
          brief_file_url: string | null
          brief_text: string | null
          budget_logic: Json | null
          client_id: string | null
          created_at: string
          digital_storytelling: Json | null
          experience_framework: Json | null
          footprint_sqft: number | null
          hero_prompt: string | null
          hero_style_confirmed: boolean | null
          human_connection: Json | null
          id: string
          inherits_brand: boolean
          inherits_brief: boolean
          interactive_mechanics: Json | null
          is_suite: boolean
          name: string
          parent_id: string | null
          parsed_brief: Json | null
          project_type: string
          render_prompts: Json | null
          scale_classification: string | null
          spatial_strategy: Json | null
          status: string
          suite_notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activation_type?: string | null
          adjacent_activations?: Json | null
          big_idea?: Json | null
          brand_website_url?: string | null
          brief_file_name?: string | null
          brief_file_url?: string | null
          brief_text?: string | null
          budget_logic?: Json | null
          client_id?: string | null
          created_at?: string
          digital_storytelling?: Json | null
          experience_framework?: Json | null
          footprint_sqft?: number | null
          hero_prompt?: string | null
          hero_style_confirmed?: boolean | null
          human_connection?: Json | null
          id?: string
          inherits_brand?: boolean
          inherits_brief?: boolean
          interactive_mechanics?: Json | null
          is_suite?: boolean
          name: string
          parent_id?: string | null
          parsed_brief?: Json | null
          project_type?: string
          render_prompts?: Json | null
          scale_classification?: string | null
          spatial_strategy?: Json | null
          status?: string
          suite_notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activation_type?: string | null
          adjacent_activations?: Json | null
          big_idea?: Json | null
          brand_website_url?: string | null
          brief_file_name?: string | null
          brief_file_url?: string | null
          brief_text?: string | null
          budget_logic?: Json | null
          client_id?: string | null
          created_at?: string
          digital_storytelling?: Json | null
          experience_framework?: Json | null
          footprint_sqft?: number | null
          hero_prompt?: string | null
          hero_style_confirmed?: boolean | null
          human_connection?: Json | null
          id?: string
          inherits_brand?: boolean
          inherits_brief?: boolean
          interactive_mechanics?: Json | null
          is_suite?: boolean
          name?: string
          parent_id?: string | null
          parsed_brief?: Json | null
          project_type?: string
          render_prompts?: Json | null
          scale_classification?: string | null
          spatial_strategy?: Json | null
          status?: string
          suite_notes?: string | null
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
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_query_log: {
        Row: {
          agency_id: string
          created_at: string
          duration_ms: number | null
          id: string
          pinned_doc_ids: string[]
          query: string
          query_truncated: string | null
          reranked: boolean
          result_chunk_ids: string[]
          result_doc_ids: string[]
          scope_ids: string[]
          scopes: string[]
          source: string
          top_k: number
          user_id: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          pinned_doc_ids?: string[]
          query: string
          query_truncated?: string | null
          reranked?: boolean
          result_chunk_ids?: string[]
          result_doc_ids?: string[]
          scope_ids?: string[]
          scopes?: string[]
          source?: string
          top_k?: number
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          pinned_doc_ids?: string[]
          query?: string
          query_truncated?: string | null
          reranked?: boolean
          result_chunk_ids?: string[]
          result_doc_ids?: string[]
          scope_ids?: string[]
          scopes?: string[]
          source?: string
          top_k?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_query_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      regional_factors: {
        Row: {
          category: string | null
          effective_at: string
          factor: number
          id: string
          notes: string | null
          region: string
          region_kind: string
          source: string | null
        }
        Insert: {
          category?: string | null
          effective_at?: string
          factor?: number
          id?: string
          notes?: string | null
          region: string
          region_kind?: string
          source?: string | null
        }
        Update: {
          category?: string | null
          effective_at?: string
          factor?: number
          id?: string
          notes?: string | null
          region?: string
          region_kind?: string
          source?: string | null
        }
        Relationships: []
      }
      rhino_renders: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          original_public_url: string
          original_storage_path: string
          polish_feedback: string | null
          polish_prompt: string | null
          polish_status: string
          polished_public_url: string | null
          polished_storage_path: string | null
          project_id: string
          updated_at: string
          user_id: string
          view_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          original_public_url: string
          original_storage_path: string
          polish_feedback?: string | null
          polish_prompt?: string | null
          polish_status?: string
          polished_public_url?: string | null
          polished_storage_path?: string | null
          project_id: string
          updated_at?: string
          user_id: string
          view_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          original_public_url?: string
          original_storage_path?: string
          polish_feedback?: string | null
          polish_prompt?: string | null
          polish_status?: string
          polished_public_url?: string | null
          polished_storage_path?: string | null
          project_id?: string
          updated_at?: string
          user_id?: string
          view_name?: string | null
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
      team_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          display_name: string
          id: string
          invited_by: string | null
          invited_email: string | null
          role: string
          team_owner_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          role?: string
          team_owner_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          role?: string
          team_owner_id?: string
          user_id?: string
        }
        Relationships: []
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
      venue_intelligence: {
        Row: {
          audience_notes: string | null
          booth_placement_tips: string | null
          city: string | null
          created_at: string
          design_tips: string[]
          id: string
          industry: string | null
          logistics_notes: string | null
          show_name: string
          source: string
          source_project_id: string | null
          traffic_patterns: string | null
          typical_booth_sizes: string[]
          union_labor_required: boolean | null
          updated_at: string
          user_id: string
          venue: string | null
        }
        Insert: {
          audience_notes?: string | null
          booth_placement_tips?: string | null
          city?: string | null
          created_at?: string
          design_tips?: string[]
          id?: string
          industry?: string | null
          logistics_notes?: string | null
          show_name: string
          source?: string
          source_project_id?: string | null
          traffic_patterns?: string | null
          typical_booth_sizes?: string[]
          union_labor_required?: boolean | null
          updated_at?: string
          user_id: string
          venue?: string | null
        }
        Update: {
          audience_notes?: string | null
          booth_placement_tips?: string | null
          city?: string | null
          created_at?: string
          design_tips?: string[]
          id?: string
          industry?: string | null
          logistics_notes?: string | null
          show_name?: string
          source?: string
          source_project_id?: string | null
          traffic_patterns?: string | null
          typical_booth_sizes?: string[]
          union_labor_required?: boolean | null
          updated_at?: string
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
      _agency_snapshot: { Args: { _agency_id: string }; Returns: Json }
      _log_agency_access: {
        Args: {
          _action: string
          _after: Json
          _agency_id: string
          _before: Json
          _metadata?: Json
          _reason: string
        }
        Returns: string
      }
      _require_super_admin: { Args: never; Returns: undefined }
      accept_pending_invite: { Args: { _invite_id: string }; Returns: boolean }
      accept_project_invite: {
        Args: { _token: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          label: string | null
          project_id: string
          scope: string
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "project_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_industry: {
        Args: {
          _description?: string
          _icon?: string
          _label: string
          _slug: string
          _sort_order?: number
          _vocabulary?: Json
        }
        Returns: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_builtin: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
          vocabulary: Json
        }
        SetofOptions: {
          from: "*"
          to: "industries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_delete_industry: {
        Args: { _force?: boolean; _slug: string }
        Returns: boolean
      }
      admin_set_activation_type_industries: {
        Args: { _activation_type_id: string; _industries: string[] }
        Returns: {
          category: string
          created_at: string
          default_scale: string | null
          default_sqft: number | null
          description: string | null
          element_emphasis: Json | null
          icon: string | null
          id: string
          industries: string[]
          is_builtin: boolean
          label: string
          parent_type_affinity: string[]
          render_context_override: string | null
          slug: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "activation_types"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_agency_industries: {
        Args: {
          _agency_id: string
          _industries: string[]
          _primary_industry: string
        }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_industry: {
        Args: {
          _description?: string
          _icon?: string
          _label?: string
          _slug: string
          _sort_order?: number
          _vocabulary?: Json
        }
        Returns: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_builtin: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
          vocabulary: Json
        }
        SetofOptions: {
          from: "*"
          to: "industries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agency_effective_status: { Args: { _agency_id: string }; Returns: string }
      agency_has_access: { Args: { _agency_id: string }; Returns: boolean }
      ai_usage_by_agency: {
        Args: { _from?: string; _to?: string }
        Returns: {
          agency_id: string
          agency_name: string
          calls: number
          cost_usd: number
          total_tokens: number
        }[]
      }
      ai_usage_by_feature: {
        Args: { _from?: string; _to?: string }
        Returns: {
          calls: number
          cost_usd: number
          feature: string
          model: string
          total_tokens: number
        }[]
      }
      ai_usage_by_user: {
        Args: { _from?: string; _to?: string }
        Returns: {
          calls: number
          cost_usd: number
          total_tokens: number
          user_email: string
          user_id: string
        }[]
      }
      ai_usage_fleet_totals: {
        Args: { _from?: string; _to?: string }
        Returns: {
          total_calls: number
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
          unique_agencies: number
          unique_users: number
        }[]
      }
      disable_agency: {
        Args: { _agency_id: string; _reason?: string }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_agency_access_log: {
        Args: { _agency_id: string; _limit?: number }
        Returns: {
          action: string
          after_state: Json
          before_state: Json
          created_at: string
          id: string
          metadata: Json
          performed_by: string
          performer_email: string
          reason: string
        }[]
      }
      get_all_user_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          is_admin: boolean
          is_super_admin: boolean
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      industry_uuid: { Args: { _slug: string }; Returns: string }
      is_agency_admin:
        | { Args: { _agency_id: string }; Returns: boolean }
        | { Args: { _agency_id: string; _user_id?: string }; Returns: boolean }
      is_agency_member:
        | { Args: { _agency_id: string }; Returns: boolean }
        | { Args: { _agency_id: string; _user_id?: string }; Returns: boolean }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id?: string }; Returns: boolean }
      list_activation_types_by_industry: {
        Args: { _industry_slug: string }
        Returns: {
          category: string
          default_scale: string
          default_sqft: number
          description: string
          icon: string
          id: string
          industries: string[]
          is_builtin: boolean
          label: string
          slug: string
          user_id: string
        }[]
      }
      list_agencies_for_admin: {
        Args: never
        Returns: {
          access_status: string
          admin_notes: string
          client_count: number
          created_at: string
          effective_status: string
          feature_flags: Json
          id: string
          last_activity_at: string
          member_count: number
          name: string
          owner_email: string
          owner_user_id: string
          project_count: number
          quotas: Json
          slug: string
          suspended_at: string
          suspension_reason: string
          trial_ends_at: string
        }[]
      }
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
      list_industries_for_admin: {
        Args: never
        Returns: {
          agency_count: number
          created_at: string
          description: string
          icon: string
          id: string
          is_builtin: boolean
          knowledge_doc_count: number
          label: string
          primary_agency_count: number
          project_type_count: number
          slug: string
          sort_order: number
          updated_at: string
          vocabulary: Json
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
          _scope_ids: string[]
          _scopes: string[]
          _vector_weight?: number
        }
        Returns: {
          bm25_score: number
          chunk_id: string
          content: string
          document_id: string
          hybrid_score: number
          is_pinned: boolean
          metadata: Json
          priority_weight: number
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
      price_plan: {
        Args: { _project_id: string; _quality_tier?: string; _region?: string }
        Returns: {
          category: string
          confidence: string
          csi_division: string
          currency: string
          description: string
          fetched_at: string
          is_priced: boolean
          item_id: string
          item_key: string
          manufacturer: string
          quality_tier: string
          quantity: number
          region_used: string
          regional_factor: number
          source: string
          source_id: string
          source_label: string
          total_price: number
          unit: string
          unit_price: number
        }[]
      }
      project_pricing_summary: {
        Args: { _project_id: string; _quality_tier?: string; _region?: string }
        Returns: {
          category: string
          csi_division: string
          item_count: number
          priced_count: number
          subtotal: number
          unpriced_count: number
        }[]
      }
      reactivate_agency: {
        Args: { _agency_id: string; _reason?: string }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_super_admin: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      seed_canopy_defaults: { Args: never; Returns: Json }
      set_agency_trial: {
        Args: { _agency_id: string; _ends_at: string }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      suspend_agency: {
        Args: { _agency_id: string; _reason?: string }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_agency_admin_notes: {
        Args: { _agency_id: string; _notes: string }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_agency_feature_flags: {
        Args: { _agency_id: string; _flags: Json }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_agency_quotas: {
        Args: { _agency_id: string; _quotas: Json }
        Returns: {
          access_status: string
          admin_notes: string | null
          brand_colors: Json | null
          created_at: string
          feature_flags: Json
          id: string
          image_model: string
          industries: string[]
          logo_url: string | null
          name: string
          owner_user_id: string
          primary_industry: string | null
          quotas: Json
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "member" | "super_admin"
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
    Enums: {
      app_role: ["admin", "member", "super_admin"],
    },
  },
} as const
