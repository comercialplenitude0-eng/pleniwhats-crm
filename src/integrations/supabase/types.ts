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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_settings: {
        Row: {
          enabled: boolean
          id: string
          max_response_time_min: number
          max_unread_per_seller: number
          max_waiting: number
          min_conversion_rate: number
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          id?: string
          max_response_time_min?: number
          max_unread_per_seller?: number
          max_waiting?: number
          min_conversion_rate?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          max_response_time_min?: number
          max_unread_per_seller?: number
          max_waiting?: number
          min_conversion_rate?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          action: Database["public"]["Enums"]["automation_action"]
          action_config: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_config: Json
          updated_at: string
        }
        Insert: {
          action: Database["public"]["Enums"]["automation_action"]
          action_config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_config?: Json
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["automation_action"]
          action_config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          trigger?: Database["public"]["Enums"]["automation_trigger"]
          trigger_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          filter_label: Database["public"]["Enums"]["conv_label"] | null
          filter_status: Database["public"]["Enums"]["conv_status"] | null
          id: string
          name: string
          scheduled_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          total_recipients: number
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          filter_label?: Database["public"]["Enums"]["conv_label"] | null
          filter_status?: Database["public"]["Enums"]["conv_status"] | null
          id?: string
          name: string
          scheduled_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          filter_label?: Database["public"]["Enums"]["conv_label"] | null
          filter_status?: Database["public"]["Enums"]["conv_status"] | null
          id?: string
          name?: string
          scheduled_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
        }
        Relationships: []
      }
      conversation_activity: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      conversation_notes: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          contact_avatar: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          crm_data: Json
          id: string
          label: Database["public"]["Enums"]["conv_label"]
          last_message: string | null
          last_message_at: string
          status: Database["public"]["Enums"]["conv_status"]
          unread_count: number
          wa_contact_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_avatar?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string
          crm_data?: Json
          id?: string
          label?: Database["public"]["Enums"]["conv_label"]
          last_message?: string | null
          last_message_at?: string
          status?: Database["public"]["Enums"]["conv_status"]
          unread_count?: number
          wa_contact_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_avatar?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          crm_data?: Json
          id?: string
          label?: Database["public"]["Enums"]["conv_label"]
          last_message?: string | null
          last_message_at?: string
          status?: Database["public"]["Enums"]["conv_status"]
          unread_count?: number
          wa_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_shared: boolean
          owner_id: string
          shortcut: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_shared?: boolean
          owner_id: string
          shortcut: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_shared?: boolean
          owner_id?: string
          shortcut?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["msg_direction"]
          id: string
          media_url: string | null
          sender_id: string | null
          status: Database["public"]["Enums"]["msg_status"]
          type: Database["public"]["Enums"]["msg_type"]
          wamid: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["msg_direction"]
          id?: string
          media_url?: string | null
          sender_id?: string | null
          status?: Database["public"]["Enums"]["msg_status"]
          type?: Database["public"]["Enums"]["msg_type"]
          wamid?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["msg_direction"]
          id?: string
          media_url?: string | null
          sender_id?: string | null
          status?: Database["public"]["Enums"]["msg_status"]
          type?: Database["public"]["Enums"]["msg_type"]
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["user_status"]
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
      workspace_settings: {
        Row: {
          away_message: string
          away_message_enabled: boolean
          business_days: number[]
          business_hours_end: string
          business_hours_start: string
          id: string
          singleton: boolean
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          away_message?: string
          away_message_enabled?: boolean
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          id?: string
          singleton?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          away_message?: string
          away_message_enabled?: boolean
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          id?: string
          singleton?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_gestor_if_none: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "vendedor" | "gestor"
      automation_action:
        | "transfer"
        | "set_label"
        | "set_status"
        | "send_template"
      automation_trigger: "no_reply" | "keyword_inbound" | "new_conversation"
      campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "completed"
        | "failed"
      conv_label: "hot" | "warm" | "cold" | "new" | "closed"
      conv_status: "aguardando" | "em_atendimento" | "encerrada"
      msg_direction: "inbound" | "outbound"
      msg_status: "sent" | "delivered" | "read" | "failed"
      msg_type: "text" | "audio" | "image" | "document" | "template"
      user_status: "online" | "busy" | "away" | "offline"
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
      app_role: ["vendedor", "gestor"],
      automation_action: [
        "transfer",
        "set_label",
        "set_status",
        "send_template",
      ],
      automation_trigger: ["no_reply", "keyword_inbound", "new_conversation"],
      campaign_status: ["draft", "scheduled", "sending", "completed", "failed"],
      conv_label: ["hot", "warm", "cold", "new", "closed"],
      conv_status: ["aguardando", "em_atendimento", "encerrada"],
      msg_direction: ["inbound", "outbound"],
      msg_status: ["sent", "delivered", "read", "failed"],
      msg_type: ["text", "audio", "image", "document", "template"],
      user_status: ["online", "busy", "away", "offline"],
    },
  },
} as const
