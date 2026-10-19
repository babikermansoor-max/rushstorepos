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
      app_settings: {
        Row: {
          aed_rate: number
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aed_rate?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aed_rate?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          branch_id: string | null
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          created_at: string
          id: string
          is_main: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_main?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_main?: boolean
          name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          spent_at: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          spent_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          spent_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          id: number
          ip: string
          success: boolean
          username: string
        }
        Insert: {
          created_at?: string
          id?: number
          ip: string
          success: boolean
          username: string
        }
        Update: {
          created_at?: string
          id?: number
          ip?: string
          success?: boolean
          username?: string
        }
        Relationships: []
      }
      phone_sales: {
        Row: {
          amount_paid: number
          branch_id: string
          cashier_id: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          invoice_no: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          phone_id: string
          sale_price: number
          trade_in_phone_id: string | null
          trade_in_value: number
          unit_cost: number
        }
        Insert: {
          amount_paid?: number
          branch_id: string
          cashier_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          invoice_no?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone_id: string
          sale_price?: number
          trade_in_phone_id?: string | null
          trade_in_value?: number
          unit_cost?: number
        }
        Update: {
          amount_paid?: number
          branch_id?: string
          cashier_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          invoice_no?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone_id?: string
          sale_price?: number
          trade_in_phone_id?: string | null
          trade_in_value?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "phone_sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_sales_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "phones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_sales_trade_in_phone_id_fkey"
            columns: ["trade_in_phone_id"]
            isOneToOne: false
            referencedRelation: "phones"
            referencedColumns: ["id"]
          },
        ]
      }
      phones: {
        Row: {
          battery_health: number | null
          branch_id: string
          brand: string
          color: string | null
          condition: Database["public"]["Enums"]["phone_condition"]
          cost_price: number
          cost_price_aed: number
          created_at: string
          created_by: string | null
          grade: string | null
          id: string
          imei: string
          model: string
          notes: string | null
          sale_price: number
          sale_price_aed: number
          seller_name: string | null
          seller_phone: string | null
          status: Database["public"]["Enums"]["phone_status"]
          storage: string | null
          updated_at: string
        }
        Insert: {
          battery_health?: number | null
          branch_id: string
          brand?: string
          color?: string | null
          condition?: Database["public"]["Enums"]["phone_condition"]
          cost_price?: number
          cost_price_aed?: number
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          imei: string
          model: string
          notes?: string | null
          sale_price?: number
          sale_price_aed?: number
          seller_name?: string | null
          seller_phone?: string | null
          status?: Database["public"]["Enums"]["phone_status"]
          storage?: string | null
          updated_at?: string
        }
        Update: {
          battery_health?: number | null
          branch_id?: string
          brand?: string
          color?: string | null
          condition?: Database["public"]["Enums"]["phone_condition"]
          cost_price?: number
          cost_price_aed?: number
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          imei?: string
          model?: string
          notes?: string | null
          sale_price?: number
          sale_price_aed?: number
          seller_name?: string | null
          seller_phone?: string | null
          status?: Database["public"]["Enums"]["phone_status"]
          storage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          branch_id: string
          category_id: string | null
          cost_price: number
          cost_price_aed: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          sale_price: number
          sale_price_aed: number
        }
        Insert: {
          barcode?: string | null
          branch_id: string
          category_id?: string | null
          cost_price?: number
          cost_price_aed?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sale_price?: number
          sale_price_aed?: number
        }
        Update: {
          barcode?: string | null
          branch_id?: string
          category_id?: string | null
          cost_price?: number
          cost_price_aed?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sale_price?: number
          sale_price_aed?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          full_name: string
          id: string
          is_approved: boolean
          phone: string | null
          username: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_approved?: boolean
          phone?: string | null
          username?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          phone?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      repairs: {
        Row: {
          branch_id: string | null
          cost: number
          created_at: string
          created_by: string | null
          customer_name: string
          device: string
          id: string
          issue: string | null
          phone: string | null
          status: Database["public"]["Enums"]["repair_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          customer_name: string
          device: string
          id?: string
          issue?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["repair_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string
          device?: string
          id?: string
          issue?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["repair_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repairs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          reason: string | null
          sale_id: string | null
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string | null
          sale_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          unit_cost: number
          unit_price: number
        }
        Insert: {
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string | null
          cashier_id: string | null
          created_at: string
          customer_name: string | null
          id: string
          invoice_no: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          total: number
        }
        Insert: {
          branch_id?: string | null
          cashier_id?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          invoice_no?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          total?: number
        }
        Update: {
          branch_id?: string | null
          cashier_id?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          invoice_no?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          branch_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          branch_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          branch_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      can_access_branch: {
        Args: { _branch: string; _user_id: string }
        Returns: boolean
      }
      create_phone_sale: {
        Args: {
          p_customer: string
          p_customer_phone: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_phone_id: string
          p_price: number
          p_trade_in: Json
        }
        Returns: {
          created_at: string
          invoice_no: number
          sale_id: string
        }[]
      }
      create_sale: {
        Args: {
          p_branch: string
          p_customer: string
          p_items: Json
          p_method: Database["public"]["Enums"]["payment_method"]
        }
        Returns: {
          created_at: string
          invoice_no: number
          sale_id: string
        }[]
      }
      current_branch: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      login_wait_seconds: {
        Args: { _ip: string; _username: string }
        Returns: number
      }
      staff_directory: {
        Args: never
        Returns: {
          full_name: string
          id: string
          username: string
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "cashier" | "warehouse"
      payment_method: "cash" | "bankak" | "fawry" | "okash"
      phone_condition: "new" | "used"
      phone_status: "available" | "sold"
      repair_status:
        | "received"
        | "in_progress"
        | "done"
        | "delivered"
        | "cancelled"
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
      app_role: ["owner", "manager", "cashier", "warehouse"],
      payment_method: ["cash", "bankak", "fawry", "okash"],
      phone_condition: ["new", "used"],
      phone_status: ["available", "sold"],
      repair_status: [
        "received",
        "in_progress",
        "done",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
