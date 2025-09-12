import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );

// Legacy export for backwards compatibility (to be removed)
export const supabase = createClient()

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          avatar_url: string | null
          phone: string | null
          role: 'admin' | 'clerk' | 'barrister' | 'read_only'
          permissions: any
          is_active: boolean
          is_verified: boolean
          last_sign_in_at: string | null
          sign_in_count: number
          chambers_id: string | null
          department: string | null
          position_title: string | null
          start_date: string | null
          require_password_change: boolean
          password_changed_at: string | null
          failed_login_attempts: number
          locked_until: string | null
          invited_by: string | null
          invited_at: string | null
          invitation_accepted_at: string | null
          invitation_token: string | null
          profile_completed: boolean
          onboarding_completed: boolean
          terms_accepted_at: string | null
          privacy_policy_accepted_at: string | null
          notification_preferences: any
          ui_preferences: any
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          email: string
          full_name: string
          avatar_url?: string | null
          phone?: string | null
          role: 'admin' | 'clerk' | 'barrister' | 'read_only'
          permissions?: any
          is_active?: boolean
          is_verified?: boolean
          last_sign_in_at?: string | null
          sign_in_count?: number
          chambers_id?: string | null
          department?: string | null
          position_title?: string | null
          start_date?: string | null
          require_password_change?: boolean
          password_changed_at?: string | null
          failed_login_attempts?: number
          locked_until?: string | null
          invited_by?: string | null
          invited_at?: string | null
          invitation_accepted_at?: string | null
          invitation_token?: string | null
          profile_completed?: boolean
          onboarding_completed?: boolean
          terms_accepted_at?: string | null
          privacy_policy_accepted_at?: string | null
          notification_preferences?: any
          ui_preferences?: any
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          avatar_url?: string | null
          phone?: string | null
          role?: 'admin' | 'clerk' | 'barrister' | 'read_only'
          permissions?: any
          is_active?: boolean
          is_verified?: boolean
          last_sign_in_at?: string | null
          sign_in_count?: number
          chambers_id?: string | null
          department?: string | null
          position_title?: string | null
          start_date?: string | null
          require_password_change?: boolean
          password_changed_at?: string | null
          failed_login_attempts?: number
          locked_until?: string | null
          invited_by?: string | null
          invited_at?: string | null
          invitation_accepted_at?: string | null
          invitation_token?: string | null
          profile_completed?: boolean
          onboarding_completed?: boolean
          terms_accepted_at?: string | null
          privacy_policy_accepted_at?: string | null
          notification_preferences?: any
          ui_preferences?: any
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      auth_audit_log: {
        Row: {
          id: string
          user_id: string | null
          event_type: string
          event_status: string
          ip_address: string | null
          user_agent: string | null
          session_id: string | null
          event_data: any
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          event_type: string
          event_status: string
          ip_address?: string | null
          user_agent?: string | null
          session_id?: string | null
          event_data?: any
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          event_type?: string
          event_status?: string
          ip_address?: string | null
          user_agent?: string | null
          session_id?: string | null
          event_data?: any
          error_message?: string | null
          created_at?: string
        }
      }
      profile_audit_log: {
        Row: {
          id: string
          profile_id: string
          operation_type: string
          changed_fields: any | null
          old_values: any | null
          new_values: any | null
          changed_by: string | null
          change_reason: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          operation_type: string
          changed_fields?: any | null
          old_values?: any | null
          new_values?: any | null
          changed_by?: string | null
          change_reason?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          operation_type?: string
          changed_fields?: any | null
          old_values?: any | null
          new_values?: any | null
          changed_by?: string | null
          change_reason?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      barristers: {
        Row: {
          id: string
          name: string
          email: string
          year_of_call: number | null
          practice_areas: string[]
          seniority: 'Pupil' | 'Junior' | 'Middle' | 'Senior' | 'KC'
          is_active: boolean
          engagement_score: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          year_of_call?: number | null
          practice_areas: string[]
          seniority: 'Pupil' | 'Junior' | 'Middle' | 'Senior' | 'KC'
          is_active?: boolean
          engagement_score?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          year_of_call?: number | null
          practice_areas?: string[]
          seniority?: 'Pupil' | 'Junior' | 'Middle' | 'Senior' | 'KC'
          is_active?: boolean
          engagement_score?: number
          created_at?: string
          updated_at?: string
        }
      }
      clerks: {
        Row: {
          id: string
          name: string
          email: string
          team: string | null
          is_senior: boolean
          max_workload: number
          current_workload: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          team?: string | null
          is_senior?: boolean
          max_workload?: number
          current_workload?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          team?: string | null
          is_senior?: boolean
          max_workload?: number
          current_workload?: number
          created_at?: string
          updated_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          name: string
          type: 'Individual' | 'Company' | 'Solicitor'
          email: string | null
          phone: string | null
          company_number: string | null
          total_value: number
          matter_count: number
          first_instruction: string | null
          last_instruction: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: 'Individual' | 'Company' | 'Solicitor'
          email?: string | null
          phone?: string | null
          company_number?: string | null
          total_value?: number
          matter_count?: number
          first_instruction?: string | null
          last_instruction?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: 'Individual' | 'Company' | 'Solicitor'
          email?: string | null
          phone?: string | null
          company_number?: string | null
          total_value?: number
          matter_count?: number
          first_instruction?: string | null
          last_instruction?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      enquiries: {
        Row: {
          id: string
          lex_reference: string | null
          client_id: string | null
          source: 'Email' | 'Phone' | 'Website' | 'Referral' | 'Direct'
          practice_area: string | null
          matter_type: string | null
          description: string | null
          estimated_value: number | null
          urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
          status: 'New' | 'Assigned' | 'In Progress' | 'Converted' | 'Lost'
          assigned_clerk_id: string | null
          assigned_barrister_id: string | null
          received_at: string
          responded_at: string | null
          converted_at: string | null
          response_time_hours: number | null
          conversion_probability: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lex_reference?: string | null
          client_id?: string | null
          source: 'Email' | 'Phone' | 'Website' | 'Referral' | 'Direct'
          practice_area?: string | null
          matter_type?: string | null
          description?: string | null
          estimated_value?: number | null
          urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
          status?: 'New' | 'Assigned' | 'In Progress' | 'Converted' | 'Lost'
          assigned_clerk_id?: string | null
          assigned_barrister_id?: string | null
          received_at?: string
          responded_at?: string | null
          converted_at?: string | null
          response_time_hours?: number | null
          conversion_probability?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lex_reference?: string | null
          client_id?: string | null
          source?: 'Email' | 'Phone' | 'Website' | 'Referral' | 'Direct'
          practice_area?: string | null
          matter_type?: string | null
          description?: string | null
          estimated_value?: number | null
          urgency?: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
          status?: 'New' | 'Assigned' | 'In Progress' | 'Converted' | 'Lost'
          assigned_clerk_id?: string | null
          assigned_barrister_id?: string | null
          received_at?: string
          responded_at?: string | null
          converted_at?: string | null
          response_time_hours?: number | null
          conversion_probability?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          enquiry_id: string | null
          barrister_id: string | null
          clerk_id: string | null
          type: 'Call' | 'Email' | 'Research' | 'Meeting' | 'Proposal' | 'Follow-up'
          description: string | null
          due_date: string | null
          completed_at: string | null
          points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          enquiry_id?: string | null
          barrister_id?: string | null
          clerk_id?: string | null
          type: 'Call' | 'Email' | 'Research' | 'Meeting' | 'Proposal' | 'Follow-up'
          description?: string | null
          due_date?: string | null
          completed_at?: string | null
          points?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          enquiry_id?: string | null
          barrister_id?: string | null
          clerk_id?: string | null
          type?: 'Call' | 'Email' | 'Research' | 'Meeting' | 'Proposal' | 'Follow-up'
          description?: string | null
          due_date?: string | null
          completed_at?: string | null
          points?: number
          created_at?: string
          updated_at?: string
        }
      }
      csv_imports: {
        Row: {
          id: string
          filename: string
          type: 'enquiries' | 'clients' | 'matters' | 'fees'
          status: 'pending' | 'processing' | 'completed' | 'failed'
          total_rows: number | null
          processed_rows: number | null
          error_rows: number | null
          errors: any | null
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          filename: string
          type: 'enquiries' | 'clients' | 'matters' | 'fees'
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          total_rows?: number | null
          processed_rows?: number | null
          error_rows?: number | null
          errors?: any | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          filename?: string
          type?: 'enquiries' | 'clients' | 'matters' | 'fees'
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          total_rows?: number | null
          processed_rows?: number | null
          error_rows?: number | null
          errors?: any | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      log_auth_event: {
        Args: {
          p_user_id: string | null
          p_event_type: string
          p_event_status?: string
          p_ip_address?: string | null
          p_user_agent?: string | null
          p_event_data?: any
        }
        Returns: string
      }
      check_user_permission: {
        Args: {
          p_user_id: string
          p_permission: string
        }
        Returns: boolean
      }
      create_user_invitation: {
        Args: {
          p_email: string
          p_role: string
          p_full_name: string
          p_invited_by: string
          p_chambers_id?: string | null
        }
        Returns: {
          id: string
          email: string
          invitation_token: string
          expires_at: string
        }
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