
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attachments": {
                  Row: {
                    "budget_revision_id": string | null,"company_id": string,"content_type": string | null,"contract_revision_id": string | null,"created_at": string,"created_by": string | null,"file_name": string | null,"id": string,"kind": string,"removed_at": string | null,"size_bytes": number | null,"updated_at": string,"uploaded_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_revision_id"?: string | null,"company_id": string,"content_type"?: string | null,"contract_revision_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"kind"?: string,"removed_at"?: string | null,"size_bytes"?: number | null,"updated_at"?: string,"uploaded_at"?: string | null
                  }
                  Update: {
                    "budget_revision_id"?: string | null,"company_id"?: string,"content_type"?: string | null,"contract_revision_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"kind"?: string,"removed_at"?: string | null,"size_bytes"?: number | null,"updated_at"?: string,"uploaded_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_company_id_budget_revision_id_fkey"
      columns: ["company_id","budget_revision_id"]
isOneToOne: false
      referencedRelation: "budget_revisions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_contract_revision_id_fkey"
      columns: ["company_id","contract_revision_id"]
isOneToOne: false
      referencedRelation: "contract_revisions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"after": Json | null,"at": string,"before": Json | null,"company_id": string,"entity": string,"entity_id": string | null,"id": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"company_id": string,"entity": string,"entity_id"?: string | null,"id"?: never,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"company_id"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: never,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_lines": {
                  Row: {
                    "amount_paisa": number,"budget_revision_id": string,"company_id": string,"created_at": string,"created_by": string | null,"heading_id": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"budget_revision_id": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"heading_id": string,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"budget_revision_id"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"heading_id"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_lines_company_id_budget_revision_id_fkey"
      columns: ["company_id","budget_revision_id"]
isOneToOne: false
      referencedRelation: "budget_revisions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "budget_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_lines_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"budget_revisions": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"effective_date": string,"id": string,"is_original": boolean,"project_id": string,"reason": string | null,"total_paisa": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"effective_date": string,"id"?: string,"is_original"?: boolean,"project_id": string,"reason"?: string | null,"total_paisa": number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string,"id"?: string,"is_original"?: boolean,"project_id"?: string,"reason"?: string | null,"total_paisa"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_revisions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_revisions_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "address": string | null,"created_at": string,"created_by": string | null,"default_date_display": Database["public"]['Enums']["date_display"],"id": string,"labour_module_enabled": boolean,"logo_path": string | null,"name": string,"pan_vat": string | null,"phone": string | null,"rate_variance_tolerance_pct": number,"slip_approval_required": boolean,"tax_fields_enabled": boolean,"updated_at": string,"vat_treatment": Database["public"]['Enums']["vat_treatment"]
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_date_display"?: Database["public"]['Enums']["date_display"],"id"?: string,"labour_module_enabled"?: boolean,"logo_path"?: string | null,"name": string,"pan_vat"?: string | null,"phone"?: string | null,"rate_variance_tolerance_pct"?: number,"slip_approval_required"?: boolean,"tax_fields_enabled"?: boolean,"updated_at"?: string,"vat_treatment"?: Database["public"]['Enums']["vat_treatment"]
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_date_display"?: Database["public"]['Enums']["date_display"],"id"?: string,"labour_module_enabled"?: boolean,"logo_path"?: string | null,"name"?: string,"pan_vat"?: string | null,"phone"?: string | null,"rate_variance_tolerance_pct"?: number,"slip_approval_required"?: boolean,"tax_fields_enabled"?: boolean,"updated_at"?: string,"vat_treatment"?: Database["public"]['Enums']["vat_treatment"]
                  }
                  Relationships: [
                    
                  ]
                },"contract_revisions": {
                  Row: {
                    "amount_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"effective_date": string,"id": string,"is_original": boolean,"project_id": string,"reason": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"effective_date": string,"id"?: string,"is_original"?: boolean,"project_id": string,"reason"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string,"id"?: string,"is_original"?: boolean,"project_id"?: string,"reason"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_revisions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_revisions_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"cost_headings": {
                  Row: {
                    "active": boolean,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"kind": Database["public"]['Enums']["heading_kind"],"name": string,"parent_id": string | null,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["heading_kind"],"name": string,"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["heading_kind"],"name"?: string,"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_headings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_headings_company_id_parent_id_fkey"
      columns: ["company_id","parent_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"doc_sequences": {
                  Row: {
                    "company_id": string,"kind": string,"next_value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"kind": string,"next_value"?: number
                  }
                  Update: {
                    "company_id"?: string,"kind"?: string,"next_value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "doc_sequences_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "active": boolean,"company_id": string,"created_at": string,"created_by": string | null,"default_heading_id": string | null,"default_unit_id": string,"id": string,"local_name": string | null,"name": string,"spec": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"company_id": string,"created_at"?: string,"created_by"?: string | null,"default_heading_id"?: string | null,"default_unit_id": string,"id"?: string,"local_name"?: string | null,"name": string,"spec"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"default_heading_id"?: string | null,"default_unit_id"?: string,"id"?: string,"local_name"?: string | null,"name"?: string,"spec"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "materials_company_id_default_heading_id_fkey"
      columns: ["company_id","default_heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "materials_company_id_default_unit_id_fkey"
      columns: ["company_id","default_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "materials_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "active": boolean,"can_approve_slips": boolean,"can_record_payments": boolean,"can_view_finance": boolean,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"roles": (Database["public"]['Enums']["app_role"])[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"can_approve_slips"?: boolean,"can_record_payments"?: boolean,"can_view_finance"?: boolean,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"roles": (Database["public"]['Enums']["app_role"])[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"can_approve_slips"?: boolean,"can_record_payments"?: boolean,"can_view_finance"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"roles"?: (Database["public"]['Enums']["app_role"])[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"date_display": Database["public"]['Enums']["date_display"] | null,"email": string | null,"full_name": string,"id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date_display"?: Database["public"]['Enums']["date_display"] | null,"email"?: string | null,"full_name"?: string,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"date_display"?: Database["public"]['Enums']["date_display"] | null,"email"?: string | null,"full_name"?: string,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_assignments": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"id": string,"project_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_assignments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_assignments_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "project_assignments_company_id_user_id_fkey"
      columns: ["company_id","user_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["company_id","user_id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "actual_end": string | null,"actual_start": string | null,"client_name": string | null,"client_phone": string | null,"code": string,"company_id": string,"created_at": string,"created_by": string | null,"district": string | null,"id": string,"location_note": string | null,"manager_id": string | null,"municipality": string | null,"name": string,"planned_end": string | null,"planned_start": string | null,"status": Database["public"]['Enums']["project_status"],"updated_at": string,"ward": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_end"?: string | null,"actual_start"?: string | null,"client_name"?: string | null,"client_phone"?: string | null,"code": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"district"?: string | null,"id"?: string,"location_note"?: string | null,"manager_id"?: string | null,"municipality"?: string | null,"name": string,"planned_end"?: string | null,"planned_start"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string,"ward"?: string | null
                  }
                  Update: {
                    "actual_end"?: string | null,"actual_start"?: string | null,"client_name"?: string | null,"client_phone"?: string | null,"code"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"district"?: string | null,"id"?: string,"location_note"?: string | null,"manager_id"?: string | null,"municipality"?: string | null,"name"?: string,"planned_end"?: string | null,"planned_start"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string,"ward"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_company_id_manager_id_fkey"
      columns: ["company_id","manager_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["company_id","user_id"]
    }
                  ]
                },"unit_conversions": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"factor": number,"from_unit_id": string,"id": string,"material_id": string | null,"to_unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"factor": number,"from_unit_id": string,"id"?: string,"material_id"?: string | null,"to_unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"factor"?: number,"from_unit_id"?: string,"id"?: string,"material_id"?: string | null,"to_unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_conversions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_conversions_company_id_from_unit_id_fkey"
      columns: ["company_id","from_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "unit_conversions_company_id_material_id_fkey"
      columns: ["company_id","material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "unit_conversions_company_id_to_unit_id_fkey"
      columns: ["company_id","to_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"units": {
                  Row: {
                    "active": boolean,"code": string,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"name": string,"needs_note": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"needs_note"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"needs_note"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "units_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_budget_revision":
{ Args: { "p_effective_date": string,"p_lines"?: Json,"p_project": string,"p_reason": string,"p_total_paisa": number }; Returns: Json
                           },
"add_contract_revision":
{ Args: { "p_amount_paisa": number,"p_effective_date": string,"p_project": string,"p_reason": string }; Returns: string
                           },
"create_company":
{ Args: { "p_full_name": string,"p_name": string,"p_phone"?: string }; Returns: string
                           },
"create_project":
{ Args: { "p_budget_paisa"?: number,"p_code": string,"p_company": string,"p_contract_paisa": number,"p_details"?: Json,"p_effective_date"?: string,"p_name": string }; Returns: string
                           },
"mark_attachment_uploaded":
{ Args: { "p_attachment": string }; Returns: undefined
                           },
"next_doc_number":
{ Args: { "p_company": string,"p_kind": string,"p_prefix": string }; Returns: string
                           },
"project_amounts_as_of":
{ Args: { "p_as_of"?: string,"p_project": string }; Returns: {
              "as_of": string,"budget_paisa": number,"budget_revision_id": string,"contract_paisa": number,"contract_revision_id": string,"original_budget_paisa": number,"original_contract_paisa": number,"planned_margin_paisa": number,"project_id": string
            }[]
                           }
          }
          Enums: {
            "app_role": "admin"|"project_manager"|"site_staff"|"accounts"|"viewer","date_display": "bs"|"ad","heading_kind": "materials"|"labour"|"subcontract"|"equipment"|"transport"|"site"|"other","project_status": "planned"|"active"|"on_hold"|"completed"|"closed"|"cancelled","vat_treatment": "vat_as_cost"|"vat_recoverable"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["admin", "project_manager", "site_staff", "accounts", "viewer"],"date_display": ["bs", "ad"],"heading_kind": ["materials", "labour", "subcontract", "equipment", "transport", "site", "other"],"project_status": ["planned", "active", "on_hold", "completed", "closed", "cancelled"],"vat_treatment": ["vat_as_cost", "vat_recoverable"]
          }
        }
} as const
