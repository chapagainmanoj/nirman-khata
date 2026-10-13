
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
                    "bill_id": string | null,"budget_revision_id": string | null,"charge_id": string | null,"client_receipt_id": string | null,"company_id": string,"content_type": string | null,"contract_revision_id": string | null,"created_at": string,"created_by": string | null,"daily_report_id": string | null,"delivery_id": string | null,"expense_id": string | null,"file_name": string | null,"id": string,"kind": string,"labour_cost_id": string | null,"payment_id": string | null,"progress_update_id": string | null,"removed_at": string | null,"size_bytes": number | null,"updated_at": string,"uploaded_at": string | null,"work_package_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_id"?: string | null,"budget_revision_id"?: string | null,"charge_id"?: string | null,"client_receipt_id"?: string | null,"company_id": string,"content_type"?: string | null,"contract_revision_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"daily_report_id"?: string | null,"delivery_id"?: string | null,"expense_id"?: string | null,"file_name"?: string | null,"id"?: string,"kind"?: string,"labour_cost_id"?: string | null,"payment_id"?: string | null,"progress_update_id"?: string | null,"removed_at"?: string | null,"size_bytes"?: number | null,"updated_at"?: string,"uploaded_at"?: string | null,"work_package_id"?: string | null
                  }
                  Update: {
                    "bill_id"?: string | null,"budget_revision_id"?: string | null,"charge_id"?: string | null,"client_receipt_id"?: string | null,"company_id"?: string,"content_type"?: string | null,"contract_revision_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"daily_report_id"?: string | null,"delivery_id"?: string | null,"expense_id"?: string | null,"file_name"?: string | null,"id"?: string,"kind"?: string,"labour_cost_id"?: string | null,"payment_id"?: string | null,"progress_update_id"?: string | null,"removed_at"?: string | null,"size_bytes"?: number | null,"updated_at"?: string,"uploaded_at"?: string | null,"work_package_id"?: string | null
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
      foreignKeyName: "attachments_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "charge_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "subcontract_charges"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_client_receipt_id_fkey"
      columns: ["company_id","client_receipt_id"]
isOneToOne: false
      referencedRelation: "client_receipts"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_contract_revision_id_fkey"
      columns: ["company_id","contract_revision_id"]
isOneToOne: false
      referencedRelation: "contract_revisions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_daily_report_id_fkey"
      columns: ["company_id","daily_report_id"]
isOneToOne: false
      referencedRelation: "daily_reports"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_delivery_id_fkey"
      columns: ["company_id","delivery_id"]
isOneToOne: false
      referencedRelation: "deliveries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expense_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_cost_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_costs"
      referencedColumns: ["company_id","id"]
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
    },{
      foreignKeyName: "attachments_company_id_progress_update_id_fkey"
      columns: ["company_id","progress_update_id"]
isOneToOne: false
      referencedRelation: "progress_updates"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attachments_company_id_work_package_id_fkey"
      columns: ["company_id","work_package_id"]
isOneToOne: false
      referencedRelation: "work_packages"
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
                },"client_receipt_reversals": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"id": string,"posted_at": string,"reason": string,"receipt_id": string,"reversal_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"posted_at"?: string,"reason": string,"receipt_id": string,"reversal_date": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"posted_at"?: string,"reason"?: string,"receipt_id"?: string,"reversal_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_receipt_reversals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_receipt_reversals_company_id_receipt_id_fkey"
      columns: ["company_id","receipt_id"]
isOneToOne: true
      referencedRelation: "client_receipts"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"client_receipts": {
                  Row: {
                    "amount_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"kind": Database["public"]['Enums']["client_receipt_kind"],"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"number": string,"posted_at": string,"project_id": string,"receipt_date": string,"reference": string | null,"status": Database["public"]['Enums']["doc_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["client_receipt_kind"],"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number": string,"posted_at"?: string,"project_id": string,"receipt_date": string,"reference"?: string | null,"status"?: Database["public"]['Enums']["doc_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["client_receipt_kind"],"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number"?: string,"posted_at"?: string,"project_id"?: string,"receipt_date"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["doc_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_receipts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_receipts_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "accent": string,"address": string | null,"created_at": string,"created_by": string | null,"default_date_display": Database["public"]['Enums']["date_display"],"id": string,"labour_module_enabled": boolean,"logo_path": string | null,"name": string,"pan_vat": string | null,"phone": string | null,"rate_variance_tolerance_pct": number,"slip_approval_required": boolean,"tax_fields_enabled": boolean,"updated_at": string,"vat_treatment": Database["public"]['Enums']["vat_treatment"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accent"?: string,"address"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_date_display"?: Database["public"]['Enums']["date_display"],"id"?: string,"labour_module_enabled"?: boolean,"logo_path"?: string | null,"name": string,"pan_vat"?: string | null,"phone"?: string | null,"rate_variance_tolerance_pct"?: number,"slip_approval_required"?: boolean,"tax_fields_enabled"?: boolean,"updated_at"?: string,"vat_treatment"?: Database["public"]['Enums']["vat_treatment"]
                  }
                  Update: {
                    "accent"?: string,"address"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_date_display"?: Database["public"]['Enums']["date_display"],"id"?: string,"labour_module_enabled"?: boolean,"logo_path"?: string | null,"name"?: string,"pan_vat"?: string | null,"phone"?: string | null,"rate_variance_tolerance_pct"?: number,"slip_approval_required"?: boolean,"tax_fields_enabled"?: boolean,"updated_at"?: string,"vat_treatment"?: Database["public"]['Enums']["vat_treatment"]
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
                },"crews": {
                  Row: {
                    "active": boolean,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"is_default": boolean,"name": string,"notes": string | null,"phone": string | null,"project_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_default"?: boolean,"name": string,"notes"?: string | null,"phone"?: string | null,"project_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_default"?: boolean,"name"?: string,"notes"?: string | null,"phone"?: string | null,"project_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crews_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crews_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"daily_report_lines": {
                  Row: {
                    "company_id": string,"description": string,"id": string,"qty": number | null,"report_id": string,"sort_order": number,"unit_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"description": string,"id"?: string,"qty"?: number | null,"report_id": string,"sort_order"?: number,"unit_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"description"?: string,"id"?: string,"qty"?: number | null,"report_id"?: string,"sort_order"?: number,"unit_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_report_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_report_lines_company_id_report_id_fkey"
      columns: ["company_id","report_id"]
isOneToOne: false
      referencedRelation: "daily_reports"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "daily_report_lines_company_id_unit_id_fkey"
      columns: ["company_id","unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"daily_reports": {
                  Row: {
                    "area": string | null,"company_id": string,"created_at": string,"created_by": string | null,"equipment": string | null,"headcount": number | null,"id": string,"issues": string | null,"labour_note": string | null,"project_id": string,"stage_id": string | null,"submitted_at": string,"weather": string | null,"work_date": string,"work_done": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"equipment"?: string | null,"headcount"?: number | null,"id": string,"issues"?: string | null,"labour_note"?: string | null,"project_id": string,"stage_id"?: string | null,"submitted_at"?: string,"weather"?: string | null,"work_date": string,"work_done": string
                  }
                  Update: {
                    "area"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"equipment"?: string | null,"headcount"?: number | null,"id"?: string,"issues"?: string | null,"labour_note"?: string | null,"project_id"?: string,"stage_id"?: string | null,"submitted_at"?: string,"weather"?: string | null,"work_date"?: string,"work_done"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_reports_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_reports_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "daily_reports_company_id_stage_id_fkey"
      columns: ["company_id","stage_id"]
isOneToOne: false
      referencedRelation: "stages"
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
      foreignKeyName: "deliveries_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "slip_summaries"
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
                },"expenses": {
                  Row: {
                    "amount_paisa": number,"bill_no": string | null,"company_id": string,"created_at": string,"created_by": string | null,"description": string,"expense_date": string,"heading_id": string,"id": string,"payee_id": string,"posted_at": string,"project_id": string,"status": Database["public"]['Enums']["doc_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"bill_no"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"description": string,"expense_date": string,"heading_id": string,"id": string,"payee_id": string,"posted_at"?: string,"project_id": string,"status"?: Database["public"]['Enums']["doc_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"bill_no"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"expense_date"?: string,"heading_id"?: string,"id"?: string,"payee_id"?: string,"posted_at"?: string,"project_id"?: string,"status"?: Database["public"]['Enums']["doc_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "expenses_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "expenses_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"labour_batches": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"crew_id": string,"from_date": string,"id": string,"project_id": string,"to_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"crew_id": string,"from_date": string,"id": string,"project_id": string,"to_date": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string,"from_date"?: string,"id"?: string,"project_id"?: string,"to_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "labour_batches_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_batches_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "labour_batches_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"labour_costs": {
                  Row: {
                    "amount_paisa": number,"batch_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"crew_id": string,"daily_report_id": string | null,"description": string | null,"headcount": number | null,"heading_id": string,"id": string,"person_days": number | null,"posted_at": string,"project_id": string,"rate_paisa": number | null,"status": Database["public"]['Enums']["doc_status"],"updated_at": string,"work_date": string,"work_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"batch_id"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"crew_id": string,"daily_report_id"?: string | null,"description"?: string | null,"headcount"?: number | null,"heading_id": string,"id": string,"person_days"?: number | null,"posted_at"?: string,"project_id": string,"rate_paisa"?: number | null,"status"?: Database["public"]['Enums']["doc_status"],"updated_at"?: string,"work_date": string,"work_type"?: string | null
                  }
                  Update: {
                    "amount_paisa"?: number,"batch_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string,"daily_report_id"?: string | null,"description"?: string | null,"headcount"?: number | null,"heading_id"?: string,"id"?: string,"person_days"?: number | null,"posted_at"?: string,"project_id"?: string,"rate_paisa"?: number | null,"status"?: Database["public"]['Enums']["doc_status"],"updated_at"?: string,"work_date"?: string,"work_type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "labour_costs_company_id_batch_id_fkey"
      columns: ["company_id","batch_id"]
isOneToOne: false
      referencedRelation: "labour_batches"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_costs_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_costs_company_id_daily_report_id_fkey"
      columns: ["company_id","daily_report_id"]
isOneToOne: false
      referencedRelation: "daily_reports"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_costs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "labour_costs_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_costs_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "balance_paisa": number,"business_date": string,"cash_paisa": number,"company_id": string,"component_key": string,"cost_paisa": number,"crew_id": string | null,"event_id": string,"event_type": string,"heading_id": string | null,"id": string,"party_id": string | null,"payee_id": string | null,"posted_at": string,"project_id": string | null,"subcontractor_id": string | null,"supplier_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "balance_paisa"?: number,"business_date": string,"cash_paisa"?: number,"company_id": string,"component_key": string,"cost_paisa"?: number,"crew_id"?: string | null,"event_id": string,"event_type": string,"heading_id"?: string | null,"id"?: string,"party_id"?: never,"payee_id"?: string | null,"posted_at": string,"project_id"?: string | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null
                  }
                  Update: {
                    "balance_paisa"?: number,"business_date"?: string,"cash_paisa"?: number,"company_id"?: string,"component_key"?: string,"cost_paisa"?: number,"crew_id"?: string | null,"event_id"?: string,"event_type"?: string,"heading_id"?: string | null,"id"?: string,"party_id"?: never,"payee_id"?: string | null,"posted_at"?: string,"project_id"?: string | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
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
      foreignKeyName: "ledger_entries_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "ledger_entries_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "ledger_entries_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
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
    },{
      foreignKeyName: "notifications_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "slip_summaries"
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
      foreignKeyName: "order_slip_lines_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "slip_summaries"
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
                    "amount_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"crew_id": string | null,"cutover_date": string,"id": string,"note": string,"party_id": string | null,"payee_id": string | null,"posted_at": string,"status": Database["public"]['Enums']["doc_status"],"subcontractor_id": string | null,"supplier_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string | null,"cutover_date": string,"id"?: string,"note": string,"party_id"?: never,"payee_id"?: string | null,"posted_at"?: string,"status"?: Database["public"]['Enums']["doc_status"],"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string | null,"cutover_date"?: string,"id"?: string,"note"?: string,"party_id"?: never,"payee_id"?: string | null,"posted_at"?: string,"status"?: Database["public"]['Enums']["doc_status"],"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "party_opening_balances_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "party_opening_balances_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "party_opening_balances_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "party_opening_balances_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "party_opening_balances_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"payees": {
                  Row: {
                    "active": boolean,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"kind": string | null,"name": string,"notes": string | null,"phone": string | null,"promoted_supplier_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string | null,"name": string,"notes"?: string | null,"phone"?: string | null,"promoted_supplier_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string | null,"name"?: string,"notes"?: string | null,"phone"?: string | null,"promoted_supplier_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payees_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payees_company_id_promoted_supplier_id_fkey"
      columns: ["company_id","promoted_supplier_id"]
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
                    "amount_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"crew_id": string | null,"id": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"number": string,"party_id": string | null,"payee_id": string | null,"payment_date": string,"posted_at": string,"reference": string | null,"status": Database["public"]['Enums']["doc_status"],"subcontractor_id": string | null,"supplier_id": string | null,"updated_at": string,"work_package_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number": string,"party_id"?: never,"payee_id"?: string | null,"payment_date": string,"posted_at"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["doc_status"],"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string,"work_package_id"?: string | null
                  }
                  Update: {
                    "amount_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number"?: string,"party_id"?: never,"payee_id"?: string | null,"payment_date"?: string,"posted_at"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["doc_status"],"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string,"work_package_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_work_package_id_fkey"
      columns: ["company_id","work_package_id"]
isOneToOne: false
      referencedRelation: "work_packages"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"posting_events": {
                  Row: {
                    "allocation_event_id": string | null,"bill_id": string | null,"business_date": string,"charge_id": string | null,"company_id": string,"created_by": string | null,"credit_id": string | null,"crew_id": string | null,"event_type": string,"expense_id": string | null,"id": string,"labour_cost_id": string | null,"op_key": string | null,"opening_balance_id": string | null,"party_id": string | null,"payee_id": string | null,"payment_id": string | null,"posted_at": string,"refund_id": string | null,"reversal_id": string | null,"reversed_event_ids": (string)[] | null,"source_id": string | null,"subcontractor_id": string | null,"supplier_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allocation_event_id"?: string | null,"bill_id"?: string | null,"business_date": string,"charge_id"?: string | null,"company_id": string,"created_by"?: string | null,"credit_id"?: string | null,"crew_id"?: string | null,"event_type": string,"expense_id"?: string | null,"id"?: string,"labour_cost_id"?: string | null,"op_key"?: string | null,"opening_balance_id"?: string | null,"party_id"?: never,"payee_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"refund_id"?: string | null,"reversal_id"?: string | null,"reversed_event_ids"?: (string)[] | null,"source_id"?: never,"subcontractor_id"?: string | null,"supplier_id"?: string | null
                  }
                  Update: {
                    "allocation_event_id"?: string | null,"bill_id"?: string | null,"business_date"?: string,"charge_id"?: string | null,"company_id"?: string,"created_by"?: string | null,"credit_id"?: string | null,"crew_id"?: string | null,"event_type"?: string,"expense_id"?: string | null,"id"?: string,"labour_cost_id"?: string | null,"op_key"?: string | null,"opening_balance_id"?: string | null,"party_id"?: never,"payee_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"refund_id"?: string | null,"reversal_id"?: string | null,"reversed_event_ids"?: (string)[] | null,"source_id"?: never,"subcontractor_id"?: string | null,"supplier_id"?: string | null
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
      foreignKeyName: "posting_events_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "charge_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "subcontract_charges"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_credit_id_fkey"
      columns: ["company_id","credit_id"]
isOneToOne: false
      referencedRelation: "credits"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expense_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posting_events_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_cost_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_costs"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_opening_balance_id_fkey"
      columns: ["company_id","opening_balance_id"]
isOneToOne: false
      referencedRelation: "party_opening_balances"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
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
      foreignKeyName: "posting_events_company_id_refund_id_fkey"
      columns: ["company_id","refund_id"]
isOneToOne: false
      referencedRelation: "refunds"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_reversal_id_fkey"
      columns: ["company_id","reversal_id"]
isOneToOne: false
      referencedRelation: "reversals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "posting_events_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
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
                },"progress_updates": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"effective_date": string,"id": string,"notes": string | null,"pct": number,"project_id": string,"reason": string | null,"stage_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"effective_date": string,"id": string,"notes"?: string | null,"pct": number,"project_id": string,"reason"?: string | null,"stage_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string,"id"?: string,"notes"?: string | null,"pct"?: number,"project_id"?: string,"reason"?: string | null,"stage_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_updates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_updates_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "progress_updates_company_id_stage_id_fkey"
      columns: ["company_id","stage_id"]
isOneToOne: false
      referencedRelation: "stages"
      referencedColumns: ["company_id","id"]
    }
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
                },"refunds": {
                  Row: {
                    "amount_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"crew_id": string | null,"id": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"number": string,"party_id": string | null,"payee_id": string | null,"posted_at": string,"project_id": string | null,"reference": string | null,"refund_date": string,"status": Database["public"]['Enums']["doc_status"],"subcontractor_id": string | null,"supplier_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number": string,"party_id"?: never,"payee_id"?: string | null,"posted_at"?: string,"project_id"?: string | null,"reference"?: string | null,"refund_date": string,"status"?: Database["public"]['Enums']["doc_status"],"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"crew_id"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"number"?: string,"party_id"?: never,"payee_id"?: string | null,"posted_at"?: string,"project_id"?: string | null,"reference"?: string | null,"refund_date"?: string,"status"?: Database["public"]['Enums']["doc_status"],"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "refunds_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "refunds_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "refunds_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "refunds_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"reversals": {
                  Row: {
                    "bill_id": string | null,"charge_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"credit_id": string | null,"crew_id": string | null,"expense_id": string | null,"id": string,"labour_cost_id": string | null,"opening_balance_id": string | null,"party_id": string | null,"payee_id": string | null,"payment_id": string | null,"posted_at": string,"reason": string,"refund_id": string | null,"reversal_date": string,"subcontractor_id": string | null,"supplier_id": string | null,"target_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_id"?: string | null,"charge_id"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"credit_id"?: string | null,"crew_id"?: string | null,"expense_id"?: string | null,"id"?: string,"labour_cost_id"?: string | null,"opening_balance_id"?: string | null,"party_id"?: never,"payee_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"reason": string,"refund_id"?: string | null,"reversal_date": string,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"target_id"?: never
                  }
                  Update: {
                    "bill_id"?: string | null,"charge_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"credit_id"?: string | null,"crew_id"?: string | null,"expense_id"?: string | null,"id"?: string,"labour_cost_id"?: string | null,"opening_balance_id"?: string | null,"party_id"?: never,"payee_id"?: string | null,"payment_id"?: string | null,"posted_at"?: string,"reason"?: string,"refund_id"?: string | null,"reversal_date"?: string,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"target_id"?: never
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
      foreignKeyName: "reversals_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "charge_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "subcontract_charges"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_credit_id_fkey"
      columns: ["company_id","credit_id"]
isOneToOne: false
      referencedRelation: "credits"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expense_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reversals_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_cost_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_costs"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_opening_balance_id_fkey"
      columns: ["company_id","opening_balance_id"]
isOneToOne: false
      referencedRelation: "party_opening_balances"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
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
      foreignKeyName: "reversals_company_id_refund_id_fkey"
      columns: ["company_id","refund_id"]
isOneToOne: false
      referencedRelation: "refunds"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "reversals_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
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
                    "amount_paisa": number,"bill_id": string | null,"business_date": string,"charge_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"doc_id": string | null,"expense_id": string | null,"id": string,"labour_cost_id": string | null,"op_key": string | null,"payment_id": string,"posted_at": string,"project_id": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paisa": number,"bill_id"?: string | null,"business_date": string,"charge_id"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"doc_id"?: never,"expense_id"?: string | null,"id"?: string,"labour_cost_id"?: string | null,"op_key"?: string | null,"payment_id": string,"posted_at"?: string,"project_id": string,"reason"?: string | null
                  }
                  Update: {
                    "amount_paisa"?: number,"bill_id"?: string | null,"business_date"?: string,"charge_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"doc_id"?: never,"expense_id"?: string | null,"id"?: string,"labour_cost_id"?: string | null,"op_key"?: string | null,"payment_id"?: string,"posted_at"?: string,"project_id"?: string,"reason"?: string | null
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
      foreignKeyName: "settlement_events_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "charge_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_charge_id_fkey"
      columns: ["company_id","charge_id"]
isOneToOne: false
      referencedRelation: "subcontract_charges"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expense_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_expense_id_fkey"
      columns: ["company_id","expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_events_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_cost_summaries"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "settlement_events_company_id_labour_cost_id_fkey"
      columns: ["company_id","labour_cost_id"]
isOneToOne: false
      referencedRelation: "labour_costs"
      referencedColumns: ["company_id","id"]
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
                },"stages": {
                  Row: {
                    "active": boolean,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"name": string,"planned_end": string | null,"planned_start": string | null,"project_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"planned_end"?: string | null,"planned_start"?: string | null,"project_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"planned_end"?: string | null,"planned_start"?: string | null,"project_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stages_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stages_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"subcontract_charges": {
                  Row: {
                    "approved_date": string | null,"approved_paisa": number | null,"charge_date": string,"claim_no": string | null,"claimed_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"description": string | null,"heading_id": string,"id": string,"posted_at": string | null,"project_id": string,"status": Database["public"]['Enums']["charge_status"],"subcontractor_id": string,"updated_at": string,"work_package_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_date"?: string | null,"approved_paisa"?: number | null,"charge_date": string,"claim_no"?: string | null,"claimed_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"description"?: string | null,"heading_id": string,"id"?: string,"posted_at"?: string | null,"project_id": string,"status"?: Database["public"]['Enums']["charge_status"],"subcontractor_id": string,"updated_at"?: string,"work_package_id": string
                  }
                  Update: {
                    "approved_date"?: string | null,"approved_paisa"?: number | null,"charge_date"?: string,"claim_no"?: string | null,"claimed_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"description"?: string | null,"heading_id"?: string,"id"?: string,"posted_at"?: string | null,"project_id"?: string,"status"?: Database["public"]['Enums']["charge_status"],"subcontractor_id"?: string,"updated_at"?: string,"work_package_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcontract_charges_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_work_package_id_fkey"
      columns: ["company_id","work_package_id"]
isOneToOne: false
      referencedRelation: "work_packages"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"subcontractors": {
                  Row: {
                    "active": boolean,"address": string | null,"company_id": string,"contact_person": string | null,"created_at": string,"created_by": string | null,"id": string,"name": string,"notes": string | null,"pan_vat": string | null,"phone": string | null,"updated_at": string,"work_types": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"company_id": string,"contact_person"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"pan_vat"?: string | null,"phone"?: string | null,"updated_at"?: string,"work_types"?: (string)[]
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"company_id"?: string,"contact_person"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"pan_vat"?: string | null,"phone"?: string | null,"updated_at"?: string,"work_types"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcontractors_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_bill_charges": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"discount_paisa": number,"id": string,"paper_total_paisa": number | null,"total_paisa": number | null,"transport_paisa": number,"updated_at": string,"vat_paisa": number,"vat_rate_pct": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"discount_paisa"?: number,"id": string,"paper_total_paisa"?: number | null,"total_paisa"?: number | null,"transport_paisa"?: number,"updated_at"?: string,"vat_paisa"?: number,"vat_rate_pct"?: number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"discount_paisa"?: number,"id"?: string,"paper_total_paisa"?: number | null,"total_paisa"?: number | null,"transport_paisa"?: number,"updated_at"?: string,"vat_paisa"?: number,"vat_rate_pct"?: number
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
                    "bill_date": string,"bill_no": string | null,"company_id": string,"cost_date": string,"created_at": string,"created_by": string | null,"due_date": string | null,"id": string,"notes": string | null,"posted_at": string | null,"posted_by": string | null,"status": Database["public"]['Enums']["bill_status"],"submitted_at": string | null,"supplier_id": string,"updated_at": string,"vat_treatment": Database["public"]['Enums']["vat_treatment"]
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_date": string,"bill_no"?: string | null,"company_id": string,"cost_date": string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"submitted_at"?: string | null,"supplier_id": string,"updated_at"?: string,"vat_treatment": Database["public"]['Enums']["vat_treatment"]
                  }
                  Update: {
                    "bill_date"?: string,"bill_no"?: string | null,"company_id"?: string,"cost_date"?: string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"submitted_at"?: string | null,"supplier_id"?: string,"updated_at"?: string,"vat_treatment"?: Database["public"]['Enums']["vat_treatment"]
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
                },"work_package_terms": {
                  Row: {
                    "agreed_value_paisa": number,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"quantity": number | null,"rate_paisa": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreed_value_paisa": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id": string,"quantity"?: number | null,"rate_paisa"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "agreed_value_paisa"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"quantity"?: number | null,"rate_paisa"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_package_terms_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_package_terms_company_id_id_fkey"
      columns: ["company_id","id"]
isOneToOne: true
      referencedRelation: "work_packages"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"work_packages": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"heading_id": string,"id": string,"notes": string | null,"planned_end": string | null,"planned_start": string | null,"progress_pct": number,"project_id": string,"rate_basis": Database["public"]['Enums']["rate_basis"],"scope": string,"status": Database["public"]['Enums']["package_status"],"subcontractor_id": string,"unit_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"heading_id": string,"id"?: string,"notes"?: string | null,"planned_end"?: string | null,"planned_start"?: string | null,"progress_pct"?: number,"project_id": string,"rate_basis"?: Database["public"]['Enums']["rate_basis"],"scope": string,"status"?: Database["public"]['Enums']["package_status"],"subcontractor_id": string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"heading_id"?: string,"id"?: string,"notes"?: string | null,"planned_end"?: string | null,"planned_start"?: string | null,"progress_pct"?: number,"project_id"?: string,"rate_basis"?: Database["public"]['Enums']["rate_basis"],"scope"?: string,"status"?: Database["public"]['Enums']["package_status"],"subcontractor_id"?: string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_packages_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_packages_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "work_packages_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "work_packages_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "work_packages_company_id_unit_id_fkey"
      columns: ["company_id","unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["company_id","id"]
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
                },"charge_summaries": {
                  Row: {
                    "approved_date": string | null,"approved_paisa": number | null,"charge_date": string | null,"claim_no": string | null,"claimed_paisa": number | null,"company_id": string | null,"created_at": string | null,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"description": string | null,"heading_id": string | null,"id": string | null,"project_id": string | null,"settled_paisa": number | null,"status": Database["public"]['Enums']["charge_status"] | null,"subcontractor_id": string | null,"work_package_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "approved_date"?: string | null,"approved_paisa"?: number | null,"charge_date"?: string | null,"claim_no"?: string | null,"claimed_paisa"?: number | null,"company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"description"?: string | null,"heading_id"?: string | null,"id"?: string | null,"project_id"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["charge_status"] | null,"subcontractor_id"?: string | null,"work_package_id"?: string | null
                         }
                        Update: {
                           "approved_date"?: string | null,"approved_paisa"?: number | null,"charge_date"?: string | null,"claim_no"?: string | null,"claimed_paisa"?: number | null,"company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"description"?: string | null,"heading_id"?: string | null,"id"?: string | null,"project_id"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["charge_status"] | null,"subcontractor_id"?: string | null,"work_package_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "subcontract_charges_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "subcontract_charges_company_id_work_package_id_fkey"
      columns: ["company_id","work_package_id"]
isOneToOne: false
      referencedRelation: "work_packages"
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
                },"expense_summaries": {
                  Row: {
                    "amount_paisa": number | null,"bill_no": string | null,"company_id": string | null,"created_at": string | null,"created_by": string | null,"description": string | null,"expense_date": string | null,"heading_id": string | null,"id": string | null,"payee_id": string | null,"posted_at": string | null,"project_id": string | null,"settled_paisa": number | null,"status": Database["public"]['Enums']["doc_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                           "amount_paisa"?: number | null,"bill_no"?: string | null,"company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"expense_date"?: string | null,"heading_id"?: string | null,"id"?: string | null,"payee_id"?: string | null,"posted_at"?: string | null,"project_id"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null
                         }
                        Update: {
                           "amount_paisa"?: number | null,"bill_no"?: string | null,"company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"expense_date"?: string | null,"heading_id"?: string | null,"id"?: string | null,"payee_id"?: string | null,"posted_at"?: string | null,"project_id"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "expenses_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "expenses_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "expenses_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"labour_cost_summaries": {
                  Row: {
                    "amount_paisa": number | null,"batch_id": string | null,"company_id": string | null,"created_at": string | null,"created_by": string | null,"crew_id": string | null,"description": string | null,"headcount": number | null,"heading_id": string | null,"id": string | null,"person_days": number | null,"posted_at": string | null,"project_id": string | null,"rate_paisa": number | null,"settled_paisa": number | null,"status": Database["public"]['Enums']["doc_status"] | null,"work_date": string | null,"work_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "amount_paisa"?: number | null,"batch_id"?: string | null,"company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"crew_id"?: string | null,"description"?: string | null,"headcount"?: number | null,"heading_id"?: string | null,"id"?: string | null,"person_days"?: number | null,"posted_at"?: string | null,"project_id"?: string | null,"rate_paisa"?: number | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null,"work_date"?: string | null,"work_type"?: string | null
                         }
                        Update: {
                           "amount_paisa"?: number | null,"batch_id"?: string | null,"company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"crew_id"?: string | null,"description"?: string | null,"headcount"?: number | null,"heading_id"?: string | null,"id"?: string | null,"person_days"?: number | null,"posted_at"?: string | null,"project_id"?: string | null,"rate_paisa"?: number | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null,"work_date"?: string | null,"work_type"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "labour_costs_company_id_batch_id_fkey"
      columns: ["company_id","batch_id"]
isOneToOne: false
      referencedRelation: "labour_batches"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_costs_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_costs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "labour_costs_company_id_heading_id_fkey"
      columns: ["company_id","heading_id"]
isOneToOne: false
      referencedRelation: "cost_headings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "labour_costs_company_id_project_id_fkey"
      columns: ["company_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
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
    },{
      foreignKeyName: "order_slip_lines_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "slip_summaries"
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
                    "allocated_paisa": number | null,"amount_paisa": number | null,"company_id": string | null,"created_by": string | null,"crew_id": string | null,"id": string | null,"method": Database["public"]['Enums']["payment_method"] | null,"notes": string | null,"number": string | null,"party_id": string | null,"payee_id": string | null,"payment_date": string | null,"posted_at": string | null,"project_ids": (string)[] | null,"reference": string | null,"settled_paisa": number | null,"status": Database["public"]['Enums']["doc_status"] | null,"subcontractor_id": string | null,"supplier_id": string | null,"work_package_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "allocated_paisa"?: never,"amount_paisa"?: number | null,"company_id"?: string | null,"created_by"?: string | null,"crew_id"?: string | null,"id"?: string | null,"method"?: Database["public"]['Enums']["payment_method"] | null,"notes"?: string | null,"number"?: string | null,"party_id"?: string | null,"payee_id"?: string | null,"payment_date"?: string | null,"posted_at"?: string | null,"project_ids"?: never,"reference"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"work_package_id"?: string | null
                         }
                        Update: {
                           "allocated_paisa"?: never,"amount_paisa"?: number | null,"company_id"?: string | null,"created_by"?: string | null,"crew_id"?: string | null,"id"?: string | null,"method"?: Database["public"]['Enums']["payment_method"] | null,"notes"?: string | null,"number"?: string | null,"party_id"?: string | null,"payee_id"?: string | null,"payment_date"?: string | null,"posted_at"?: string | null,"project_ids"?: never,"reference"?: string | null,"settled_paisa"?: never,"status"?: Database["public"]['Enums']["doc_status"] | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"work_package_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "payments_company_id_crew_id_fkey"
      columns: ["company_id","crew_id"]
isOneToOne: false
      referencedRelation: "crews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_company_id_payee_id_fkey"
      columns: ["company_id","payee_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_subcontractor_id_fkey"
      columns: ["company_id","subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_supplier_id_fkey"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payments_company_id_work_package_id_fkey"
      columns: ["company_id","work_package_id"]
isOneToOne: false
      referencedRelation: "work_packages"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"slip_summaries": {
                  Row: {
                    "company_id": string | null,"created_at": string | null,"created_by": string | null,"fulfilment": string | null,"id": string | null,"number": string | null,"project_ids": (string)[] | null,"request_date": string | null,"required_date": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["slip_status"] | null,"supplier_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"fulfilment"?: never,"id"?: string | null,"number"?: string | null,"project_ids"?: never,"request_date"?: string | null,"required_date"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["slip_status"] | null,"supplier_id"?: string | null
                         }
                        Update: {
                           "company_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"fulfilment"?: never,"id"?: string | null,"number"?: string | null,"project_ids"?: never,"request_date"?: string | null,"required_date"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["slip_status"] | null,"supplier_id"?: string | null
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
                }
          }
          Functions: {
            "add_budget_revision":
{ Args: { "p_effective_date": string,"p_lines"?: Json,"p_project": string,"p_reason": string,"p_total_paisa": number }; Returns: Json
                           },
"add_contract_revision":
{ Args: { "p_amount_paisa": number,"p_effective_date": string,"p_project": string,"p_reason": string }; Returns: string
                           },
"add_progress_update":
{ Args: { "p_update": Json }; Returns: Json
                           },
"allocate_payment":
{ Args: { "p_changes": Json,"p_op_key": string,"p_payment": string,"p_reason": string }; Returns: Json
                           },
"approve_charge":
{ Args: { "p_approved_paisa": number,"p_charge": string,"p_date"?: string,"p_note"?: string,"p_op_key": string }; Returns: Json
                           },
"attachment_upload_target":
{ Args: { "p_attachment": string }; Returns: {
              "company_id": string,"content_type": string,"size_bytes": number
            }[]
                           },
"bill_preview":
{ Args: { "p_bill": string }; Returns: Json
                           },
"bill_project_status":
{ Args: { "p_bill": string }; Returns: {
              "credited_paisa": number,"outstanding_paisa": number,"payable_paisa": number,"project_id": string,"settled_paisa": number
            }[]
                           },
"bills_owed":
{ Args: { "p_company": string,"p_project"?: string,"p_supplier"?: string }; Returns: number
                           },
"calendar_events":
{ Args: { "p_company": string,"p_from": string,"p_project"?: string,"p_to": string }; Returns: {
              "at": string,"cash_paisa": number,"cost_paisa": number,"created_by": string,"detail": string,"event_date": string,"kind": string,"label": string,"link_id": string,"link_kind": string,"money": string,"party_name": string,"project_id": string,"received_paisa": number
            }[]
                           },
"cancel_slip":
{ Args: { "p_reason": string,"p_slip": string }; Returns: undefined
                           },
"client_received_as_of":
{ Args: { "p_as_of": string,"p_project": string }; Returns: number
                           },
"close_slip_short":
{ Args: { "p_reason": string,"p_slip": string }; Returns: undefined
                           },
"company_dashboard":
{ Args: { "p_as_of"?: string,"p_company": string,"p_from": string,"p_to": string }; Returns: Json
                           },
"copy_stages":
{ Args: { "p_from": string,"p_to": string }; Returns: number
                           },
"create_company":
{ Args: { "p_full_name": string,"p_name": string,"p_phone"?: string }; Returns: string
                           },
"create_project":
{ Args: { "p_budget_paisa"?: number,"p_code": string,"p_company": string,"p_contract_paisa": number,"p_details"?: Json,"p_effective_date"?: string,"p_name": string }; Returns: string
                           },
"create_stages":
{ Args: { "p_names": (string)[],"p_project": string }; Returns: number
                           },
"decide_slip":
{ Args: { "p_approve": boolean,"p_reason"?: string,"p_slip": string }; Returns: Database["public"]['Enums']["slip_status"]
                           },
"delete_bill_draft":
{ Args: { "p_bill": string }; Returns: undefined
                           },
"delete_charge_draft":
{ Args: { "p_charge": string }; Returns: undefined
                           },
"delete_delivery":
{ Args: { "p_delivery": string }; Returns: undefined
                           },
"delete_slip_draft":
{ Args: { "p_slip": string }; Returns: undefined
                           },
"export_company_data":
{ Args: { "p_company": string }; Returns: Json
                           },
"last_billed_rate":
{ Args: { "p_material": string,"p_supplier": string }; Returns: {
              "bill_date": string,"bill_no": string,"qty": number,"rate_paisa": number
            }[]
                           },
"mark_attachment_uploaded":
{ Args: { "p_attachment": string,"p_size": number,"p_user": string }; Returns: undefined
                           },
"mark_slip_sent":
{ Args: { "p_slip": string,"p_via": string }; Returns: undefined
                           },
"next_doc_number":
{ Args: { "p_company": string,"p_kind": string,"p_prefix": string }; Returns: string
                           },
"party_balances":
{ Args: { "p_as_of"?: string,"p_company": string,"p_kind": string }; Returns: {
              "active": boolean,"balance_paisa": number,"charged_paisa": number,"company_level": boolean,"paid_paisa": number,"party_id": string,"party_name": string,"project_balance_paisa": number,"project_id": string,"unallocated_paisa": number
            }[]
                           },
"party_khata":
{ Args: { "p_from"?: string,"p_party": string,"p_project"?: string,"p_to"?: string }; Returns: {
              "balance_paisa": number,"business_date": string,"cash_paisa": number,"cost_paisa": number,"doc_id": string,"doc_kind": string,"event_id": string,"event_type": string,"label": string,"posted_at": string,"project_id": string,"reason": string,"running_balance_paisa": number
            }[]
                           },
"party_open_items":
{ Args: { "p_party": string }; Returns: {
              "amount_paisa": number,"doc_date": string,"doc_id": string,"kind": string,"label": string,"project_id": string
            }[]
                           },
"post_bill":
{ Args: { "p_bill": string,"p_op_key": string }; Returns: Json
                           },
"post_credit":
{ Args: { "p_credit": Json,"p_op_key": string }; Returns: Json
                           },
"progress_as_of":
{ Args: { "p_date"?: string,"p_project": string }; Returns: {
              "effective_date": string,"name": string,"overdue": boolean,"pct": number,"planned_end": string,"planned_start": string,"sort_order": number,"stage_id": string,"updated_by": string
            }[]
                           },
"project_amounts_as_of":
{ Args: { "p_as_of"?: string,"p_project": string }; Returns: {
              "as_of": string,"budget_paisa": number,"budget_revision_id": string,"contract_paisa": number,"contract_revision_id": string,"original_budget_paisa": number,"original_contract_paisa": number,"planned_margin_paisa": number,"project_id": string
            }[]
                           },
"project_cost_summary":
{ Args: { "p_as_known"?: boolean,"p_as_of"?: string,"p_project": string }; Returns: Json
                           },
"project_dashboard":
{ Args: { "p_as_known"?: boolean,"p_as_of"?: string,"p_project": string }; Returns: Json
                           },
"promote_payee":
{ Args: { "p_payee": string }; Returns: string
                           },
"record_client_receipt":
{ Args: { "p_op_key": string,"p_receipt": Json }; Returns: Json
                           },
"record_delivery":
{ Args: { "p_delivery": Json }; Returns: string
                           },
"record_payment":
{ Args: { "p_op_key": string,"p_payment": Json }; Returns: Json
                           },
"record_refund":
{ Args: { "p_op_key": string,"p_refund": Json }; Returns: Json
                           },
"record_return":
{ Args: { "p_return": Json }; Returns: string
                           },
"refund_available":
{ Args: { "p_party": string,"p_project"?: string }; Returns: number
                           },
"refund_rooms":
{ Args: { "p_party": string }; Returns: {
              "available_paisa": number,"project_id": string
            }[]
                           },
"reject_charge":
{ Args: { "p_charge": string,"p_reason": string }; Returns: undefined
                           },
"remove_attachment":
{ Args: { "p_attachment": string }; Returns: boolean
                           },
"report_cost_by_heading":
{ Args: { "p_as_known"?: boolean,"p_as_of"?: string,"p_company": string,"p_project"?: string }; Returns: {
              "budget_effective_date": string,"budget_paisa": number,"budget_revision_id": string,"cost_paisa": number,"heading": string,"heading_id": string,"parent_heading": string,"project_id": string
            }[]
                           },
"report_daily_activity":
{ Args: { "p_company": string,"p_from": string,"p_project"?: string,"p_to": string }; Returns: {
              "area": string,"created_by": string,"headcount": number,"issues": string,"labour_paisa": number,"project_id": string,"report_id": string,"stage": string,"weather": string,"work_date": string,"work_done": string
            }[]
                           },
"report_day":
{ Args: { "p_date": string,"p_project": string }; Returns: {
              "at": string,"created_by": string,"detail": string,"id": string,"kind": string,"label": string
            }[]
                           },
"report_labour":
{ Args: { "p_company": string,"p_crew"?: string,"p_from": string,"p_project"?: string,"p_to": string }; Returns: {
              "amount_paisa": number,"crew": string,"crew_id": string,"daily_report_id": string,"headcount": number,"labour_cost_id": string,"paid_paisa": number,"person_days": number,"project_id": string,"reversed_on": string,"work_date": string,"work_type": string
            }[]
                           },
"report_material_purchases":
{ Args: { "p_company": string,"p_from": string,"p_project"?: string,"p_supplier"?: string,"p_to": string }; Returns: {
              "bills": number,"cost_paisa": number,"material": string,"material_id": string,"project_id": string,"qty": number,"suppliers": string,"unit": string
            }[]
                           },
"report_payments":
{ Args: { "p_as_of"?: string,"p_company": string,"p_from": string,"p_party"?: string,"p_project"?: string,"p_to": string }; Returns: {
              "amount_paisa": number,"kind": string,"method": Database["public"]['Enums']["payment_method"],"number": string,"party_id": string,"party_kind": string,"party_name": string,"payment_date": string,"payment_id": string,"project_paisa": number,"reference": string,"reversed_on": string,"settled_paisa": number
            }[]
                           },
"report_pending_orders":
{ Args: { "p_company": string,"p_project"?: string }; Returns: {
              "age_days": number,"doc_date": string,"doc_id": string,"doc_number": string,"item": string,"kind": string,"project_id": string,"qty": number,"supplier_name": string,"unit": string
            }[]
                           },
"report_progress_history":
{ Args: { "p_company": string,"p_from": string,"p_project"?: string,"p_to": string }; Returns: {
              "created_at": string,"created_by": string,"effective_date": string,"notes": string,"pct": number,"previous_pct": number,"project_id": string,"reason": string,"stage": string,"update_id": string
            }[]
                           },
"reverse_bill":
{ Args: { "p_bill": string,"p_date": string,"p_op_key": string,"p_reason": string }; Returns: Json
                           },
"reverse_client_receipt":
{ Args: { "p_date": string,"p_op_key": string,"p_reason": string,"p_receipt": string }; Returns: Json
                           },
"reverse_cost_entry":
{ Args: { "p_date": string,"p_doc": string,"p_op_key": string,"p_reason": string }; Returns: Json
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
"reverse_refund":
{ Args: { "p_date": string,"p_op_key": string,"p_reason": string,"p_refund": string }; Returns: Json
                           },
"save_bill_draft":
{ Args: { "p_bill": Json }; Returns: Json
                           },
"save_charge_claim":
{ Args: { "p_charge": Json }; Returns: string
                           },
"save_expense":
{ Args: { "p_expense": Json,"p_op_key": string }; Returns: Json
                           },
"save_labour_batch":
{ Args: { "p_batch": Json,"p_op_key": string }; Returns: Json
                           },
"save_labour_cost":
{ Args: { "p_entry": Json,"p_op_key": string }; Returns: Json
                           },
"save_slip_draft":
{ Args: { "p_slip": Json }; Returns: Json
                           },
"save_work_package":
{ Args: { "p_package": Json }; Returns: string
                           },
"set_opening_balance":
{ Args: { "p_amount_paisa": number,"p_cutover_date": string,"p_note": string,"p_op_key": string,"p_party": string }; Returns: Json
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
"submit_daily_report":
{ Args: { "p_op_key": string,"p_report": Json }; Returns: Json
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
                           },
"work_package_figures":
{ Args: { "p_project": string }; Returns: {
              "agreed_value_paisa": number,"approved_paisa": number,"balance_paisa": number,"paid_paisa": number,"pending_claims_paisa": number,"remaining_value_paisa": number,"work_package_id": string
            }[]
                           }
          }
          Enums: {
            "app_role": "admin"|"project_manager"|"site_staff"|"accounts"|"viewer","bill_charge": "discount"|"transport"|"vat","bill_line_type": "material"|"charge","bill_status": "draft"|"under_review"|"posted"|"reversed","charge_status": "draft"|"approved"|"rejected"|"reversed","client_receipt_kind": "advance"|"running_bill"|"final"|"other","date_display": "bs"|"ad","delivery_issue": "shortage"|"damage"|"rejected"|"spec_difference"|"other","doc_status": "posted"|"reversed","heading_kind": "materials"|"labour"|"subcontract"|"equipment"|"transport"|"site"|"other","package_status": "planned"|"in_progress"|"completed"|"cancelled","payment_method": "cash"|"bank_transfer"|"cheque"|"wallet"|"other","project_status": "planned"|"active"|"on_hold"|"completed"|"closed"|"cancelled","rate_basis": "lump_sum"|"rate","slip_status": "draft"|"pending"|"approved"|"rejected"|"cancelled","vat_treatment": "vat_as_cost"|"vat_recoverable"
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
            "app_role": ["admin", "project_manager", "site_staff", "accounts", "viewer"],"bill_charge": ["discount", "transport", "vat"],"bill_line_type": ["material", "charge"],"bill_status": ["draft", "under_review", "posted", "reversed"],"charge_status": ["draft", "approved", "rejected", "reversed"],"client_receipt_kind": ["advance", "running_bill", "final", "other"],"date_display": ["bs", "ad"],"delivery_issue": ["shortage", "damage", "rejected", "spec_difference", "other"],"doc_status": ["posted", "reversed"],"heading_kind": ["materials", "labour", "subcontract", "equipment", "transport", "site", "other"],"package_status": ["planned", "in_progress", "completed", "cancelled"],"payment_method": ["cash", "bank_transfer", "cheque", "wallet", "other"],"project_status": ["planned", "active", "on_hold", "completed", "closed", "cancelled"],"rate_basis": ["lump_sum", "rate"],"slip_status": ["draft", "pending", "approved", "rejected", "cancelled"],"vat_treatment": ["vat_as_cost", "vat_recoverable"]
          }
        }
} as const
