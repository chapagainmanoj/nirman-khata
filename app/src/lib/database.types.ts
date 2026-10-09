
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
                    "bill_id": string | null,"budget_revision_id": string | null,"company_id": string,"content_type": string | null,"contract_revision_id": string | null,"created_at": string,"created_by": string | null,"delivery_id": string | null,"file_name": string | null,"id": string,"kind": string,"payment_id": string | null,"removed_at": string | null,"size_bytes": number | null,"updated_at": string,"uploaded_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_id"?: string | null,"budget_revision_id"?: string | null,"company_id": string,"content_type"?: string | null,"contract_revision_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"delivery_id"?: string | null,"file_name"?: string | null,"id"?: string,"kind"?: string,"payment_id"?: string | null,"removed_at"?: string | null,"size_bytes"?: number | null,"updated_at"?: string,"uploaded_at"?: string | null
                  }
                  Update: {
                    "bill_id"?: string | null,"budget_revision_id"?: string | null,"company_id"?: string,"content_type"?: string | null,"contract_revision_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"delivery_id"?: string | null,"file_name"?: string | null,"id"?: string,"kind"?: string,"payment_id"?: string | null,"removed_at"?: string | null,"size_bytes"?: number | null,"updated_at"?: string,"uploaded_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    },{
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
      foreignKeyName: "attachments_company_id_delivery_id_fkey"
      columns: ["company_id","delivery_id"]
isOneToOne: false
      referencedRelation: "deliveries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payment_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["company_id","id"]
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
                },"bill_charge_overrides": {
                  Row: {
                    "amount_paisa": number,"bill_id": string,"charge": Database["public"]['Enums']["bill_charge"],"company_id": string,"created_at": string,"created_by": string | null,"id": string,"project_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"bill_id": string,"charge": Database["public"]['Enums']["bill_charge"],"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"bill_id"?: string,"charge"?: Database["public"]['Enums']["bill_charge"],"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_charge_overrides_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_charge_overrides_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_charge_overrides_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_charge_overrides_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"bill_line_delivery_lines": {
                  Row: {
                    "bill_line_id": string,"billed_qty": number,"company_id": string,"created_at": string,"created_by": string | null,"delivery_line_id": string,"id": string,"project_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_line_id": string,"billed_qty": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"delivery_line_id": string,"id"?: string,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bill_line_id"?: string,"billed_qty"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"delivery_line_id"?: string,"id"?: string,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_line_delivery_lines_company_id_bill_line_id_fkey"
      columns: ["company_id","bill_line_id"]
isOneToOne: false
      referencedRelation: "bill_lines"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_line_delivery_lines_company_id_delivery_line_id_fkey"
      columns: ["company_id","delivery_line_id"]
isOneToOne: false
      referencedRelation: "delivery_line_status"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_line_delivery_lines_company_id_delivery_line_id_fkey"
      columns: ["company_id","delivery_line_id"]
isOneToOne: false
      referencedRelation: "delivery_lines"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_line_delivery_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_line_delivery_lines_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"bill_lines": {
                  Row: {
                    "amount_paisa": number,"bill_id": string,"company_id": string,"cost_amount_paisa": number | null,"created_at": string,"created_by": string | null,"description": string | null,"discount_share_paisa": number | null,"heading_id": string,"id": string,"line_type": Database["public"]['Enums']["bill_line_type"],"material_id": string | null,"payable_amount_paisa": number | null,"project_id": string,"qty": number | null,"rate_paisa": number | null,"rate_variance_reason": string | null,"sort_order": number,"transport_share_paisa": number | null,"unit_id": string | null,"unit_note": string | null,"unmatched_reason": string | null,"updated_at": string,"vat_share_paisa": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"bill_id": string,"company_id": string,"cost_amount_paisa"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"discount_share_paisa"?: number | null,"heading_id": string,"id"?: string,"line_type"?: Database["public"]['Enums']["bill_line_type"],"material_id"?: string | null,"payable_amount_paisa"?: number | null,"project_id": string,"qty"?: number | null,"rate_paisa"?: number | null,"rate_variance_reason"?: string | null,"sort_order"?: number,"transport_share_paisa"?: number | null,"unit_id"?: string | null,"unit_note"?: string | null,"unmatched_reason"?: string | null,"updated_at"?: string,"vat_share_paisa"?: number | null
                  }
                  Update: {
                    "amount_paisa"?: number,"bill_id"?: string,"company_id"?: string,"cost_amount_paisa"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"discount_share_paisa"?: number | null,"heading_id"?: string,"id"?: string,"line_type"?: Database["public"]['Enums']["bill_line_type"],"material_id"?: string | null,"payable_amount_paisa"?: number | null,"project_id"?: string,"qty"?: number | null,"rate_paisa"?: number | null,"rate_variance_reason"?: string | null,"sort_order"?: number,"transport_share_paisa"?: number | null,"unit_id"?: string | null,"unit_note"?: string | null,"unmatched_reason"?: string | null,"updated_at"?: string,"vat_share_paisa"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_lines_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_lines_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_lines_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_lines_company_id_material_id_fkey"
      columns: ["company_id","material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_lines_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "bill_lines_company_id_unit_id_fkey"
      columns: ["company_id","unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["company_id","id"]
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
                },"credit_lines": {
                  Row: {
                    "amount_paisa": number,"bill_line_id": string,"company_id": string,"cost_paisa": number,"created_at": string,"created_by": string | null,"credit_id": string,"credited_qty": number | null,"heading_id": string,"id": string,"project_id": string,"supplier_return_line_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"bill_line_id": string,"company_id": string,"cost_paisa": number,"created_at"?: string,"created_by"?: string | null,"credit_id": string,"credited_qty"?: number | null,"heading_id": string,"id"?: string,"project_id": string,"supplier_return_line_id"?: string | null
                  }
                  Update: {
                    "amount_paisa"?: number,"bill_line_id"?: string,"company_id"?: string,"cost_paisa"?: number,"created_at"?: string,"created_by"?: string | null,"credit_id"?: string,"credited_qty"?: number | null,"heading_id"?: string,"id"?: string,"project_id"?: string,"supplier_return_line_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_lines_company_id_bill_line_id_fkey"
      columns: ["company_id","bill_line_id"]
isOneToOne: false
      referencedRelation: "bill_lines"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "credit_lines_company_id_credit_id_fkey"
      columns: ["company_id","credit_id"]
isOneToOne: false
      referencedRelation: "credits"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "credit_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_lines_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "credit_lines_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "credit_lines_company_id_supplier_return_line_id_fkey"
      columns: ["company_id","supplier_return_line_id"]
isOneToOne: false
      referencedRelation: "supplier_return_lines"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"credits": {
                  Row: {
                    "bill_id": string,"company_id": string,"created_at": string,"created_by": string | null,"credit_date": string,"id": string,"number": string,"posted_at": string,"reason": string,"status": Database["public"]['Enums']["doc_status"],"supplier_credit_no": string | null,"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_id": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"credit_date": string,"id"?: string,"number": string,"posted_at"?: string,"reason": string,"status"?: Database["public"]['Enums']["doc_status"],"supplier_credit_no"?: string | null,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bill_id"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"credit_date"?: string,"id"?: string,"number"?: string,"posted_at"?: string,"reason"?: string,"status"?: Database["public"]['Enums']["doc_status"],"supplier_credit_no"?: string | null,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credits_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "credits_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "credits_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credits_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"deliveries": {
                  Row: {
                    "challan_no": string | null,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"no_slip_reason": string | null,"note": string | null,"project_id": string,"receipt_date": string,"received_by": string,"slip_id": string | null,"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "challan_no"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"no_slip_reason"?: string | null,"note"?: string | null,"project_id": string,"receipt_date": string,"received_by": string,"slip_id"?: string | null,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "challan_no"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"no_slip_reason"?: string | null,"note"?: string | null,"project_id"?: string,"receipt_date"?: string,"received_by"?: string,"slip_id"?: string | null,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deliveries_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deliveries_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "deliveries_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slip_progress"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "deliveries_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slips"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "deliveries_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"delivery_lines": {
                  Row: {
                    "accepted_qty": number | null,"company_id": string,"created_at": string,"created_by": string | null,"delivery_id": string,"id": string,"issue": Database["public"]['Enums']["delivery_issue"] | null,"material_id": string | null,"material_text": string | null,"note": string | null,"received_qty": number,"rejected_qty": number,"slip_line_id": string | null,"sort_order": number,"spec": string | null,"unit_id": string,"unit_note": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_qty"?: never,"company_id": string,"created_at"?: string,"created_by"?: string | null,"delivery_id": string,"id"?: string,"issue"?: Database["public"]['Enums']["delivery_issue"] | null,"material_id"?: string | null,"material_text"?: string | null,"note"?: string | null,"received_qty": number,"rejected_qty"?: number,"slip_line_id"?: string | null,"sort_order"?: number,"spec"?: string | null,"unit_id": string,"unit_note"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accepted_qty"?: never,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"delivery_id"?: string,"id"?: string,"issue"?: Database["public"]['Enums']["delivery_issue"] | null,"material_id"?: string | null,"material_text"?: string | null,"note"?: string | null,"received_qty"?: number,"rejected_qty"?: number,"slip_line_id"?: string | null,"sort_order"?: number,"spec"?: string | null,"unit_id"?: string,"unit_note"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_lines_company_id_delivery_id_fkey"
      columns: ["company_id","delivery_id"]
isOneToOne: false
      referencedRelation: "deliveries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "delivery_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_lines_company_id_material_id_fkey"
      columns: ["company_id","material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "delivery_lines_company_id_slip_line_id_fkey"
      columns: ["company_id","slip_line_id"]
isOneToOne: false
      referencedRelation: "order_slip_line_progress"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "delivery_lines_company_id_slip_line_id_fkey"
      columns: ["company_id","slip_line_id"]
isOneToOne: false
      referencedRelation: "order_slip_lines"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "delivery_lines_company_id_unit_id_fkey"
      columns: ["company_id","unit_id"]
isOneToOne: false
      referencedRelation: "units"
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
                },"ledger_entries": {
                  Row: {
                    "balance_paisa": number,"business_date": string,"cash_paisa": number,"company_id": string,"component_key": string,"cost_paisa": number,"event_id": string,"event_type": string,"heading_id": string | null,"id": string,"posted_at": string,"project_id": string | null,"supplier_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance_paisa"?: number,"business_date": string,"cash_paisa"?: number,"company_id": string,"component_key": string,"cost_paisa"?: number,"event_id": string,"event_type": string,"heading_id"?: string | null,"id"?: string,"posted_at": string,"project_id"?: string | null,"supplier_id": string
                  }
                  Update: {
                    "balance_paisa"?: number,"business_date"?: string,"cash_paisa"?: number,"company_id"?: string,"component_key"?: string,"cost_paisa"?: number,"event_id"?: string,"event_type"?: string,"heading_id"?: string | null,"id"?: string,"posted_at"?: string,"project_id"?: string | null,"supplier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_company_id_event_id_fkey"
      columns: ["company_id","event_id"]
isOneToOne: false
      referencedRelation: "posting_events"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "ledger_entries_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "ledger_entries_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "ledger_entries_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
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
                },"notifications": {
                  Row: {
                    "body": string | null,"company_id": string,"created_at": string,"id": string,"kind": string,"read_at": string | null,"slip_id": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"kind": string,"read_at"?: string | null,"slip_id"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"read_at"?: string | null,"slip_id"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slip_progress"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "notifications_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slips"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"operations": {
                  Row: {
                    "company_id": string,"created_at": string,"kind": string,"op_key": string,"request_hash": string,"result": Json | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"kind": string,"op_key": string,"request_hash": string,"result"?: Json | null,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"kind"?: string,"op_key"?: string,"request_hash"?: string,"result"?: Json | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "operations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"order_slip_line_prices": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"est_rate_paisa": number,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"est_rate_paisa": number,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"est_rate_paisa"?: number,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_slip_line_prices_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_slip_line_prices_company_id_id_fkey"
      columns: ["company_id","id"]
isOneToOne: false
      referencedRelation: "order_slip_line_progress"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "order_slip_line_prices_company_id_id_fkey"
      columns: ["company_id","id"]
isOneToOne: false
      referencedRelation: "order_slip_lines"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"order_slip_lines": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"id": string,"material_id": string | null,"material_text": string | null,"note": string | null,"project_id": string,"qty": number,"slip_id": string,"sort_order": number,"spec": string | null,"unit_id": string,"unit_note": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"material_id"?: string | null,"material_text"?: string | null,"note"?: string | null,"project_id": string,"qty": number,"slip_id": string,"sort_order"?: number,"spec"?: string | null,"unit_id": string,"unit_note"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"material_id"?: string | null,"material_text"?: string | null,"note"?: string | null,"project_id"?: string,"qty"?: number,"slip_id"?: string,"sort_order"?: number,"spec"?: string | null,"unit_id"?: string,"unit_note"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_slip_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_material_id_fkey"
      columns: ["company_id","material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slip_progress"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slips"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_unit_id_fkey"
      columns: ["company_id","unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"order_slips": {
                  Row: {
                    "cancelled_reason": string | null,"closed_by": string | null,"closed_short_at": string | null,"closed_short_reason": string | null,"company_id": string,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"delivery_instructions": string | null,"id": string,"notes": string | null,"number": string,"rejected_reason": string | null,"request_date": string,"required_date": string | null,"sent_at": string | null,"sent_by": string | null,"sent_via": string | null,"site_contact": string | null,"status": Database["public"]['Enums']["slip_status"],"submitted_at": string | null,"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_reason"?: string | null,"closed_by"?: string | null,"closed_short_at"?: string | null,"closed_short_reason"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"delivery_instructions"?: string | null,"id"?: string,"notes"?: string | null,"number": string,"rejected_reason"?: string | null,"request_date": string,"required_date"?: string | null,"sent_at"?: string | null,"sent_by"?: string | null,"sent_via"?: string | null,"site_contact"?: string | null,"status"?: Database["public"]['Enums']["slip_status"],"submitted_at"?: string | null,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancelled_reason"?: string | null,"closed_by"?: string | null,"closed_short_at"?: string | null,"closed_short_reason"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"delivery_instructions"?: string | null,"id"?: string,"notes"?: string | null,"number"?: string,"rejected_reason"?: string | null,"request_date"?: string,"required_date"?: string | null,"sent_at"?: string | null,"sent_by"?: string | null,"sent_via"?: string | null,"site_contact"?: string | null,"status"?: Database["public"]['Enums']["slip_status"],"submitted_at"?: string | null,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_slips_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_slips_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"party_opening_balances": {
                  Row: {
                    "amount_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"cutover_date": string,"id": string,"note": string,"posted_at": string,"status": Database["public"]['Enums']["doc_status"],"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"cutover_date": string,"id"?: string,"note": string,"posted_at"?: string,"status"?: Database["public"]['Enums']["doc_status"],"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"cutover_date"?: string,"id"?: string,"note"?: string,"posted_at"?: string,"status"?: Database["public"]['Enums']["doc_status"],"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "party_opening_balances_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "party_opening_balances_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"payment_allocation_events": {
                  Row: {
                    "amount_paisa": number,"business_date": string,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"payment_id": string,"posted_at": string,"project_id": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"business_date": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_id": string,"posted_at"?: string,"project_id": string,"reason"?: string | null
                  }
                  Update: {
                    "amount_paisa"?: number,"business_date"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_id"?: string,"posted_at"?: string,"project_id"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocation_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocation_events_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payment_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payment_allocation_events_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payment_allocation_events_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"number": string,"payment_date": string,"posted_at": string,"reference": string | null,"status": Database["public"]['Enums']["doc_status"],"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number": string,"payment_date": string,"posted_at"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["doc_status"],"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number"?: string,"payment_date"?: string,"posted_at"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["doc_status"],"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"posting_events": {
                  Row: {
                    "allocation_event_id": string | null,"bill_id": string | null,"business_date": string,"company_id": string,"created_by": string | null,"credit_id": string | null,"event_type": string,"id": string,"op_key": string | null,"opening_balance_id": string | null,"payment_id": string | null,"posted_at": string,"reversal_id": string | null,"reversed_event_ids": (string)[] | null,"source_id": string | null,"supplier_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allocation_event_id"?: string | null,"bill_id"?: string | null,"business_date": string,"company_id": string,"created_by"?: string | null,"credit_id"?: string | null,"event_type": string,"id"?: string,"op_key"?: string | null,"opening_balance_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"reversal_id"?: string | null,"reversed_event_ids"?: (string)[] | null,"source_id"?: never,"supplier_id": string
                  }
                  Update: {
                    "allocation_event_id"?: string | null,"bill_id"?: string | null,"business_date"?: string,"company_id"?: string,"created_by"?: string | null,"credit_id"?: string | null,"event_type"?: string,"id"?: string,"op_key"?: string | null,"opening_balance_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"reversal_id"?: string | null,"reversed_event_ids"?: (string)[] | null,"source_id"?: never,"supplier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posting_events_company_id_allocation_event_id_fkey"
      columns: ["company_id","allocation_event_id"]
isOneToOne: false
      referencedRelation: "payment_allocation_events"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_credit_id_fkey"
      columns: ["company_id","credit_id"]
isOneToOne: false
      referencedRelation: "credits"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posting_events_company_id_opening_balance_id_fkey"
      columns: ["company_id","opening_balance_id"]
isOneToOne: false
      referencedRelation: "party_opening_balances"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payment_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_reversal_id_fkey"
      columns: ["company_id","reversal_id"]
isOneToOne: false
      referencedRelation: "reversals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
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
                },"reversals": {
                  Row: {
                    "bill_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"credit_id": string | null,"id": string,"opening_balance_id": string | null,"payment_id": string | null,"posted_at": string,"reason": string,"reversal_date": string,"supplier_id": string,"target_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_id"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"credit_id"?: string | null,"id"?: string,"opening_balance_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"reason": string,"reversal_date": string,"supplier_id": string,"target_id"?: never
                  }
                  Update: {
                    "bill_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"credit_id"?: string | null,"id"?: string,"opening_balance_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"reason"?: string,"reversal_date"?: string,"supplier_id"?: string,"target_id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "reversals_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_credit_id_fkey"
      columns: ["company_id","credit_id"]
isOneToOne: false
      referencedRelation: "credits"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reversals_company_id_opening_balance_id_fkey"
      columns: ["company_id","opening_balance_id"]
isOneToOne: false
      referencedRelation: "party_opening_balances"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payment_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"settlement_events": {
                  Row: {
                    "amount_paisa": number,"bill_id": string,"business_date": string,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"op_key": string | null,"payment_id": string,"posted_at": string,"project_id": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"bill_id": string,"business_date": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"op_key"?: string | null,"payment_id": string,"posted_at"?: string,"project_id": string,"reason"?: string | null
                  }
                  Update: {
                    "amount_paisa"?: number,"bill_id"?: string,"business_date"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"op_key"?: string | null,"payment_id"?: string,"posted_at"?: string,"project_id"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_events_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_bill_id_fkey"
      columns: ["company_id","bill_id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_events_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payment_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_payment_id_fkey"
      columns: ["company_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"supplier_bill_charges": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"discount_paisa": number,"id": string,"total_paisa": number | null,"transport_paisa": number,"updated_at": string,"vat_paisa": number,"vat_rate_pct": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"discount_paisa"?: number,"id": string,"total_paisa"?: number | null,"transport_paisa"?: number,"updated_at"?: string,"vat_paisa"?: number,"vat_rate_pct"?: number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"discount_paisa"?: number,"id"?: string,"total_paisa"?: number | null,"transport_paisa"?: number,"updated_at"?: string,"vat_paisa"?: number,"vat_rate_pct"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_bill_charges_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_bill_charges_company_id_id_fkey"
      columns: ["company_id","id"]
isOneToOne: false
      referencedRelation: "bill_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "supplier_bill_charges_company_id_id_fkey"
      columns: ["company_id","id"]
isOneToOne: false
      referencedRelation: "supplier_bills"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"supplier_bills": {
                  Row: {
                    "bill_date": string,"bill_no": string,"company_id": string,"cost_date": string,"created_at": string,"created_by": string | null,"due_date": string | null,"id": string,"notes": string | null,"posted_at": string | null,"posted_by": string | null,"status": Database["public"]['Enums']["bill_status"],"submitted_at": string | null,"supplier_id": string,"updated_at": string,"vat_treatment": Database["public"]['Enums']["vat_treatment"]
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_date": string,"bill_no": string,"company_id": string,"cost_date": string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"submitted_at"?: string | null,"supplier_id": string,"updated_at"?: string,"vat_treatment": Database["public"]['Enums']["vat_treatment"]
                  }
                  Update: {
                    "bill_date"?: string,"bill_no"?: string,"company_id"?: string,"cost_date"?: string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"submitted_at"?: string | null,"supplier_id"?: string,"updated_at"?: string,"vat_treatment"?: Database["public"]['Enums']["vat_treatment"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_bills_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_bills_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"supplier_return_lines": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"delivery_line_id": string,"id": string,"note": string | null,"qty": number,"return_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"delivery_line_id": string,"id"?: string,"note"?: string | null,"qty": number,"return_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"delivery_line_id"?: string,"id"?: string,"note"?: string | null,"qty"?: number,"return_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_return_lines_company_id_delivery_line_id_fkey"
      columns: ["company_id","delivery_line_id"]
isOneToOne: false
      referencedRelation: "delivery_line_status"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "supplier_return_lines_company_id_delivery_line_id_fkey"
      columns: ["company_id","delivery_line_id"]
isOneToOne: false
      referencedRelation: "delivery_lines"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "supplier_return_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_return_lines_company_id_return_id_fkey"
      columns: ["company_id","return_id"]
isOneToOne: false
      referencedRelation: "supplier_returns"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"supplier_returns": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"id": string,"note": string | null,"project_id": string,"return_date": string,"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"project_id": string,"return_date": string,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"project_id"?: string,"return_date"?: string,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_returns_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_returns_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "supplier_returns_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "active": boolean,"address": string | null,"categories": (string)[],"company_id": string,"contact_person": string | null,"created_at": string,"created_by": string | null,"id": string,"name": string,"notes": string | null,"pan_vat": string | null,"payment_terms": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"categories"?: (string)[],"company_id": string,"contact_person"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"pan_vat"?: string | null,"payment_terms"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"categories"?: (string)[],"company_id"?: string,"contact_person"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"pan_vat"?: string | null,"payment_terms"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
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
            "bill_summaries": {
                  Row: {
                    "bill_date": string | null,"bill_no": string | null,"company_id": string | null,"cost_date": string | null,"created_at": string | null,"created_by": string | null,"credited_paisa": number | null,"due_date": string | null,"id": string | null,"lines_paisa": number | null,"payable_paisa": number | null,"posted_at": string | null,"project_ids": (string)[] | null,"settled_paisa": number | null,"status": Database["public"]['Enums']["bill_status"] | null,"supplier_id": string | null,"total_paisa": number | null,"vat_treatment": Database["public"]['Enums']["vat_treatment"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "supplier_bills_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_bills_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"delivery_line_status": {
                  Row: {
                    "accepted_qty": number | null,"awaiting_credit_qty": number | null,"billable_qty": number | null,"billed_qty": number | null,"company_id": string | null,"credited_qty": number | null,"delivery_id": string | null,"id": string | null,"net_received_qty": number | null,"project_id": string | null,"returned_qty": number | null,"slip_line_id": string | null,"supplier_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "delivery_lines_company_id_delivery_id_fkey"
      columns: ["company_id","delivery_id"]
isOneToOne: false
      referencedRelation: "deliveries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "delivery_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_lines_company_id_slip_line_id_fkey"
      columns: ["company_id","slip_line_id"]
isOneToOne: false
      referencedRelation: "order_slip_line_progress"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "delivery_lines_company_id_slip_line_id_fkey"
      columns: ["company_id","slip_line_id"]
isOneToOne: false
      referencedRelation: "order_slip_lines"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"order_slip_line_progress": {
                  Row: {
                    "company_id": string | null,"id": string | null,"ordered_qty": number | null,"over_received": boolean | null,"project_id": string | null,"received_qty": number | null,"remaining_qty": number | null,"slip_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "order_slip_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slip_progress"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "order_slip_lines_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "order_slips"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"order_slip_progress": {
                  Row: {
                    "company_id": string | null,"fulfilment": string | null,"id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "company_id"?: string | null,"fulfilment"?: never,"id"?: string | null
                         }
                        Update: {
                           "company_id"?: string | null,"fulfilment"?: never,"id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "order_slips_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_summaries": {
                  Row: {
                    "allocated_paisa": number | null,"amount_paisa": number | null,"company_id": string | null,"created_by": string | null,"id": string | null,"method": Database["public"]['Enums']["payment_method"] | null,"notes": string | null,"number": string | null,"payment_date": string | null,"posted_at": string | null,"reference": string | null,"settled_paisa": number | null,"status": Database["public"]['Enums']["doc_status"] | null,"supplier_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "allocated_paisa"?: never,"amount_paisa"?: number | null,"company_id"?: string | null,"created_by"?: string | null,"id"?: string | null,"method"?: Database["public"]['Enums']["payment_method"] | null,"notes"?: string | null,"number"?: string | null,"payment_date"?: string | null,"posted_at"?: string | null,"reference"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null,"supplier_id"?: string | null
                         }
                        Update: {
                           "allocated_paisa"?: never,"amount_paisa"?: number | null,"company_id"?: string | null,"created_by"?: string | null,"id"?: string | null,"method"?: Database["public"]['Enums']["payment_method"] | null,"notes"?: string | null,"number"?: string | null,"payment_date"?: string | null,"posted_at"?: string | null,"reference"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null,"supplier_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "payments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                }
          }
          Functions: {
            "add_budget_revision":
{ Args: { "p_effective_date": string,"p_lines"?: Json,"p_project": string,"p_reason": string,"p_total_paisa": number }; Returns: Json
                           },
"add_contract_revision":
{ Args: { "p_amount_paisa": number,"p_effective_date": string,"p_project": string,"p_reason": string }; Returns: string
                           },
"allocate_payment":
{ Args: { "p_changes": Json,"p_op_key": string,"p_payment": string,"p_reason": string }; Returns: Json
                           },
"bill_preview":
{ Args: { "p_bill": string }; Returns: Json
                           },
"bill_project_status":
{ Args: { "p_bill": string }; Returns: {
              "credited_paisa": number,"outstanding_paisa": number,"payable_paisa": number,"project_id": string,"settled_paisa": number
            }[]
                           },
"cancel_slip":
{ Args: { "p_reason": string,"p_slip": string }; Returns: undefined
                           },
"close_slip_short":
{ Args: { "p_reason": string,"p_slip": string }; Returns: undefined
                           },
"create_company":
{ Args: { "p_full_name": string,"p_name": string,"p_phone"?: string }; Returns: string
                           },
"create_project":
{ Args: { "p_budget_paisa"?: number,"p_code": string,"p_company": string,"p_contract_paisa": number,"p_details"?: Json,"p_effective_date"?: string,"p_name": string }; Returns: string
                           },
"decide_slip":
{ Args: { "p_approve": boolean,"p_reason"?: string,"p_slip": string }; Returns: Database["public"]['Enums']["slip_status"]
                           },
"delete_bill_draft":
{ Args: { "p_bill": string }; Returns: undefined
                           },
"delete_delivery":
{ Args: { "p_delivery": string }; Returns: undefined
                           },
"delete_slip_draft":
{ Args: { "p_slip": string }; Returns: undefined
                           },
"last_billed_rate":
{ Args: { "p_material": string,"p_supplier": string }; Returns: {
              "bill_date": string,"bill_no": string,"qty": number,"rate_paisa": number
            }[]
                           },
"mark_attachment_uploaded":
{ Args: { "p_attachment": string }; Returns: undefined
                           },
"mark_slip_sent":
{ Args: { "p_slip": string,"p_via": string }; Returns: undefined
                           },
"next_doc_number":
{ Args: { "p_company": string,"p_kind": string,"p_prefix": string }; Returns: string
                           },
"post_bill":
{ Args: { "p_bill": string,"p_op_key": string }; Returns: Json
                           },
"post_credit":
{ Args: { "p_credit": Json,"p_op_key": string }; Returns: Json
                           },
"project_amounts_as_of":
{ Args: { "p_as_of"?: string,"p_project": string }; Returns: {
              "as_of": string,"budget_paisa": number,"budget_revision_id": string,"contract_paisa": number,"contract_revision_id": string,"original_budget_paisa": number,"original_contract_paisa": number,"planned_margin_paisa": number,"project_id": string
            }[]
                           },
"project_cost_summary":
{ Args: { "p_as_known"?: boolean,"p_as_of"?: string,"p_project": string }; Returns: Json
                           },
"record_delivery":
{ Args: { "p_delivery": Json }; Returns: string
                           },
"record_payment":
{ Args: { "p_op_key": string,"p_payment": Json }; Returns: Json
                           },
"record_return":
{ Args: { "p_return": Json }; Returns: string
                           },
"remove_attachment":
{ Args: { "p_attachment": string }; Returns: undefined
                           },
"reverse_bill":
{ Args: { "p_bill": string,"p_date": string,"p_op_key": string,"p_reason": string }; Returns: Json
                           },
"reverse_credit":
{ Args: { "p_credit": string,"p_date": string,"p_op_key": string,"p_reason": string }; Returns: Json
                           },
"reverse_opening_balance":
{ Args: { "p_date": string,"p_op_key": string,"p_opening_balance": string,"p_reason": string }; Returns: Json
                           },
"reverse_payment":
{ Args: { "p_date": string,"p_op_key": string,"p_payment": string,"p_reason": string }; Returns: Json
                           },
"save_bill_draft":
{ Args: { "p_bill": Json }; Returns: Json
                           },
"save_slip_draft":
{ Args: { "p_slip": Json }; Returns: Json
                           },
"set_opening_balance":
{ Args: { "p_amount_paisa": number,"p_cutover_date": string,"p_note": string,"p_op_key": string,"p_supplier": string }; Returns: Json
                           },
"settle":
{ Args: { "p_items": Json,"p_op_key": string }; Returns: Json
                           },
"slip_permissions":
{ Args: { "p_slip": string }; Returns: Json
                           },
"submit_bill":
{ Args: { "p_bill": string }; Returns: undefined
                           },
"submit_slip":
{ Args: { "p_slip": string }; Returns: Database["public"]['Enums']["slip_status"]
                           },
"supplier_balances":
{ Args: { "p_as_of"?: string,"p_company": string }; Returns: {
              "active": boolean,"balance_paisa": number,"charged_paisa": number,"company_level": boolean,"paid_paisa": number,"project_balance_paisa": number,"supplier_id": string,"supplier_name": string,"unallocated_paisa": number
            }[]
                           },
"supplier_khata":
{ Args: { "p_from"?: string,"p_project"?: string,"p_supplier": string,"p_to"?: string }; Returns: {
              "balance_paisa": number,"bill_id": string,"business_date": string,"cash_paisa": number,"cost_paisa": number,"credit_id": string,"event_id": string,"event_type": string,"label": string,"payment_id": string,"posted_at": string,"project_id": string,"reason": string,"running_balance_paisa": number
            }[]
                           },
"supplier_open_items":
{ Args: { "p_supplier": string }; Returns: {
              "amount_paisa": number,"doc_date": string,"doc_id": string,"kind": string,"label": string,"project_id": string
            }[]
                           },
"unsettle":
{ Args: { "p_amount_paisa": number,"p_bill": string,"p_op_key": string,"p_payment": string,"p_project": string,"p_reason": string }; Returns: Json
                           }
          }
          Enums: {
            "app_role": "admin"|"project_manager"|"site_staff"|"accounts"|"viewer","bill_charge": "discount"|"transport"|"vat","bill_line_type": "material"|"charge","bill_status": "draft"|"under_review"|"posted"|"reversed","date_display": "bs"|"ad","delivery_issue": "shortage"|"damage"|"rejected"|"spec_difference"|"other","doc_status": "posted"|"reversed","heading_kind": "materials"|"labour"|"subcontract"|"equipment"|"transport"|"site"|"other","payment_method": "cash"|"bank_transfer"|"cheque"|"wallet"|"other","project_status": "planned"|"active"|"on_hold"|"completed"|"closed"|"cancelled","slip_status": "draft"|"pending"|"approved"|"rejected"|"cancelled","vat_treatment": "vat_as_cost"|"vat_recoverable"
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
            "app_role": ["admin", "project_manager", "site_staff", "accounts", "viewer"],"bill_charge": ["discount", "transport", "vat"],"bill_line_type": ["material", "charge"],"bill_status": ["draft", "under_review", "posted", "reversed"],"date_display": ["bs", "ad"],"delivery_issue": ["shortage", "damage", "rejected", "spec_difference", "other"],"doc_status": ["posted", "reversed"],"heading_kind": ["materials", "labour", "subcontract", "equipment", "transport", "site", "other"],"payment_method": ["cash", "bank_transfer", "cheque", "wallet", "other"],"project_status": ["planned", "active", "on_hold", "completed", "closed", "cancelled"],"slip_status": ["draft", "pending", "approved", "rejected", "cancelled"],"vat_treatment": ["vat_as_cost", "vat_recoverable"]
          }
        }
} as const
