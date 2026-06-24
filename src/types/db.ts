export type TimeEntryType = 'requirement' | 'administrative'

export type AdminCategory =
  | 'administrativa'
  | 'coordinacion_cuentas'
  | 'reunion_interna'
  | 'direccion_creativa'
  | 'direccion_comunicacion'
  | 'standby'

export type ContentType =
  | 'historia'
  | 'estatico'
  | 'video_corto'
  | 'reel'
  | 'short'
  | 'produccion'
  | 'reunion'
  | 'matriz_contenido'

export type Phase =
  | 'pendiente'
  | 'proceso_edicion'
  | 'proceso_diseno'
  | 'proceso_animacion'
  | 'cambios'
  | 'pausa'
  | 'revision_interna'
  | 'revision_diseno'
  | 'revision_cliente'
  | 'aprobado'
  | 'pendiente_publicar'
  | 'publicado_entregado'

export type Priority = 'baja' | 'media' | 'alta'

export type RequirementApprovalStatus = 'approved' | 'pending' | 'rejected'

export type CreditKind =
  | 'cambios'
  | 'content_estatico'
  | 'content_video_corto'
  | 'content_reel'
  | 'content_short'

/** Mapping de ContentType vendible → CreditKind. */
export const CONTENT_TYPE_TO_CREDIT_KIND: Partial<Record<ContentType, CreditKind>> = {
  estatico: 'content_estatico',
  video_corto: 'content_video_corto',
  reel: 'content_reel',
  short: 'content_short',
}

export const CREDIT_KIND_TO_CONTENT_TYPE: Partial<Record<CreditKind, ContentType>> = {
  content_estatico: 'estatico',
  content_video_corto: 'video_corto',
  content_reel: 'reel',
  content_short: 'short',
}

export interface ClientCredit {
  id: string
  client_id: string
  kind: CreditKind
  qty_initial: number
  qty_remaining: number
  unit_price_usd: number
  source_invoice_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceExtrasMetadata {
  kind: 'cambios' | 'content'
  content_type?: ContentType
  qty: number
}

export type WorkSessionStatus = 'active' | 'on_lunch' | 'on_away' | 'ended'

export type ShiftBreakType = 'lunch' | 'away'

export interface WorkSessionBreak {
  type: ShiftBreakType
  started_at: string
  ended_at?: string
}

export interface WorkSession {
  id: string
  user_id: string
  started_at: string
  ended_at: string | null
  status: WorkSessionStatus
  notes: string | null
  breaks_json: WorkSessionBreak[]
  total_seconds: number | null
  productive_seconds: number | null
  created_at: string
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  baja:  'Baja',
  media: 'Media',
  alta:  'Alta',
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  baja:  '#27ae60',
  media: '#f2c94c',
  alta:  '#E5316E',
}

export type ClientStatus = 'active' | 'paused' | 'overdue'
export type CycleStatus = 'current' | 'archived' | 'pending_renewal' | 'scheduled'
export type PaymentStatus = 'paid' | 'unpaid'
export type UserRole = 'admin' | 'supervisor' | 'operator' | 'client' | 'directora' | 'coordinadora_familias' | 'coordinadora_terapias' | 'terapista' | 'maestra' | 'recepcion' | 'contable' | 'family'
export type ConversationType = 'dm' | 'channel' | 'voice_channel'

export type CallModality = 'voice' | 'video' | 'screen'

/** Estado manual que el usuario elige para sí mismo. */
export type PresenceStatus = 'online' | 'away' | 'almuerzo'

/** Estado efectivo que ven los demás — incluye el override automático en llamada y el estado desconectado. */
export type EffectivePresenceStatus = PresenceStatus | 'en_llamada' | 'offline'

export interface PresenceInfo {
  user_id: string
  status: PresenceStatus
  updated_at: string
}

export type ClientUserRole = 'owner' | 'viewer'

export interface ClientUser {
  id: string
  user_id: string
  client_id: string
  role: ClientUserRole
  /** Acceso a sección de facturación/cobranza del portal (migración 0073). */
  can_billing: boolean
  /** Acceso a gestión de trabajo: requerimientos, revisión, chat (migración 0073). */
  can_work: boolean
  created_at: string
}

export type ClientPortalCapability = 'billing' | 'work'

export type RenewalRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed'

export interface RenewalRequest {
  id: string
  client_id: string
  requested_by: string
  from_cycle_id: string | null
  status: RenewalRequestStatus
  rollover_items_json: Array<{ requirement_id: string; action: 'carry' | 'drop' }>
  addons_json: Record<string, unknown>
  admin_notes: string | null
  created_at: string
  decided_at: string | null
  decided_by: string | null
}

// ── Billing (migración 0048) ─────────────────────────────────
export type PersonType = 'natural' | 'juridical'
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
export type InvoicePaymentMethod = 'cash' | 'transfer' | 'check' | 'card' | 'other'

// ── n1co (migración 0060) ────────────────────────────────────
export type PaymentProvider =
  | 'manual'              // efectivo, transferencia, cheque (markInvoicePaid manual)
  | 'n1co_subscription'   // suscripción recurrente n1co
  | 'n1co_link'           // payment link dinámico por factura
  | 'n1co_link_oneoff'    // paquete extra (cambios/contenido) cobrado fuera del ciclo
  | 'n1co_static'         // link estático por plan (fallback)

export type N1coSubscriptionStatus =
  | 'Pending' | 'Active' | 'Inactive' | 'Blocked' | 'Error' | 'Cancelled'

export type N1coEnvironment = 'sandbox' | 'production'

/** Tipo de DTE según el catálogo del Ministerio de Hacienda de El Salvador. */
export type DteTipo = '01' | '03' | '05' | '06' | '14'

export const DTE_TIPO_LABELS: Record<DteTipo, string> = {
  '01': 'Factura de Consumidor Final',
  '03': 'Comprobante de Crédito Fiscal',
  '05': 'Nota de Crédito',
  '06': 'Nota de Débito',
  '14': 'Factura de Sujeto Excluido',
}

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  manual:             'Manual',
  n1co_subscription:  'Suscripción n1co',
  n1co_link:          'Link n1co (por factura)',
  n1co_link_oneoff:   'Link n1co (paquete extra)',
  n1co_static:        'Link n1co (estático)',
}

export interface PaymentMethodConfig {
  id: string
  type: 'bank' | 'card' | 'other'
  label: string
  account_holder?: string
  account_number?: string
  account_type?: string
  note?: string
}

export interface TermAndCondition {
  id: string
  order: number
  text: string
}

/** Snapshot inmutable de los datos fiscales del cliente al momento de emisión. */
export interface ClientFiscalSnapshot {
  /** null cuando es un prospecto sin cliente creado en BD (migración 0075). */
  id: string | null
  name: string
  legal_name: string | null
  person_type: PersonType | null
  nit: string | null
  nrc: string | null
  dui: string | null
  fiscal_address: string | null
  giro: string | null
  country_code: string | null
  contact_email: string | null
  contact_phone: string | null
}

/** Snapshot inmutable de `company_settings` al momento de emisión. */
export interface EmitterSnapshot {
  legal_name: string
  trade_name: string | null
  nit: string | null
  nrc: string | null
  fiscal_address: string | null
  giro: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  invoice_footer_note: string | null
  payment_methods: PaymentMethodConfig[]
}

export interface PlanLimits {
  historias: number
  estaticos: number
  videos_cortos: number
  reels: number
  shorts: number
  producciones: number
  reuniones?: number              // opcional: ciclos anteriores a la migración no lo tienen
  reunion_duracion_horas?: number // opcional: ídem
  matrices_contenido?: number     // opcional: ciclos anteriores a la migración no lo tienen
  unified_content_limit?: number | null // plan "Contenido": pool único de N tipables
}

export interface CambiosPackage {
  qty: number
  price_usd: number | null
  note: string | null
  created_at: string
}

export interface ExtraContentItem {
  content_type?: ContentType       // standard content item (video, estático)
  label: string                    // display label — either from content_type or custom description
  qty: number
  price_per_unit: number
  note: string | null
  created_at: string
}

export type BillingPeriod = 'monthly' | 'biweekly'

export type WeekKey = 'S1' | 'S2' | 'S3' | 'S4'
export type WeeklyDistribution = Partial<Record<WeekKey, Partial<Record<ContentType, number>>>>

/**
 * Mapped type que "des-interfaza" un type para que sea asignable a Record<string, unknown>.
 * TypeScript no acepta `interface X { ... }` directamente como Row de Supabase
 * (porque interfaces son "open" via declaration merging). Esta utilidad lo arregla.
 */
type AsRow<T> = { [K in keyof T]: T[K] }

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: UserRole
          created_at: string
          avatar_url: string | null
          default_assignee: boolean
          current_session_id: string | null
          can_quote: boolean
          max_hours_per_week: number | null
          monthly_salary_usd: number | null
          hourly_rate_usd: number | null
          contract_type: PayrollContractType
          in_normal_payroll: boolean
          in_professional_services_payroll: boolean
          dui: string | null
          isss_number: string | null
          afp_number: string | null
          afp_provider: AfpProvider | null
          hire_date: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string
          role?: UserRole
          avatar_url?: string | null
          default_assignee?: boolean
          current_session_id?: string | null
          can_quote?: boolean
          max_hours_per_week?: number | null
          monthly_salary_usd?: number | null
          hourly_rate_usd?: number | null
          contract_type?: PayrollContractType
          in_normal_payroll?: boolean
          in_professional_services_payroll?: boolean
          dui?: string | null
          isss_number?: string | null
          afp_number?: string | null
          afp_provider?: AfpProvider | null
          hire_date?: string | null
        }
        Update: {
          email?: string
          full_name?: string
          role?: UserRole
          avatar_url?: string | null
          default_assignee?: boolean
          current_session_id?: string | null
          can_quote?: boolean
          max_hours_per_week?: number | null
          monthly_salary_usd?: number | null
          hourly_rate_usd?: number | null
          contract_type?: PayrollContractType
          in_normal_payroll?: boolean
          in_professional_services_payroll?: boolean
          dui?: string | null
          isss_number?: string | null
          afp_number?: string | null
          afp_provider?: AfpProvider | null
          hire_date?: string | null
        }
        Relationships: []
      }
      payroll_fiscal_config: {
        Row: AsRow<PayrollFiscalConfig>
        Insert: {
          id?: string
          effective_from: string
          isss_employee_rate: number
          isss_employer_rate: number
          isss_cap_salary_usd: number
          afp_employee_rate: number
          afp_employer_rate: number
          afp_cap_salary_usd?: number | null
          isr_brackets_json: IsrBracket[]
          professional_services_isr_rate?: number
          notes?: string | null
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<PayrollFiscalConfig, 'id' | 'created_at'>>
        Relationships: []
      }
      payroll_runs: {
        Row: AsRow<PayrollRun>
        Insert: {
          id?: string
          period_year: number
          period_month: number
          payroll_type?: PayrollType
          status?: PayrollRunStatus
          fiscal_config_snapshot_json?: Record<string, unknown> | null
          notes?: string | null
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<PayrollRun, 'id' | 'created_at'>>
        Relationships: []
      }
      payroll_items: {
        Row: AsRow<PayrollItem>
        Insert: {
          id?: string
          payroll_run_id: string
          user_id: string
          user_snapshot_json?: Record<string, unknown> | null
          base_salary_usd?: number
          extra_hours?: number
          extra_hours_rate_usd?: number | null
          extra_hours_amount_usd?: number
          bonus_usd?: number
          other_deductions_usd?: number
          gross_total_usd?: number
          isss_employee_usd?: number
          afp_employee_usd?: number
          isr_usd?: number
          total_deductions_usd?: number
          net_pay_usd?: number
          isss_employer_usd?: number
          afp_employer_usd?: number
          employer_cost_usd?: number
          hours_worked_from_appointments?: number | null
          hours_worked_from_sessions?: number | null
          notes?: string | null
        }
        Update: Partial<Omit<PayrollItem, 'id' | 'created_at'>>
        Relationships: []
      }
      general_expenses: {
        Row: AsRow<GeneralExpense>
        Insert: {
          id?: string
          category: ExpenseCategory
          subcategory?: string | null
          description?: string | null
          amount_usd: number
          expense_date: string
          payment_method?: string | null
          provider?: string | null
          invoice_reference?: string | null
          notes?: string | null
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<GeneralExpense, 'id' | 'created_at'>>
        Relationships: []
      }
      child_attachments: {
        Row: AsRow<ChildAttachment>
        Insert: {
          id?: string
          child_id: string
          appointment_id?: string | null
          session_report_id?: string | null
          progress_report_id?: string | null
          file_url: string
          file_name: string
          file_size_bytes?: number | null
          file_mime_type?: string | null
          title?: string | null
          description?: string | null
          kind?: ChildAttachmentKind
          visible_to_family?: boolean
          uploaded_by_user_id?: string | null
        }
        Update: Partial<Omit<ChildAttachment, 'id' | 'created_at'>>
        Relationships: []
      }
      therapist_work_schedule: {
        Row: AsRow<TherapistWorkScheduleBlock>
        Insert: {
          id?: string
          therapist_id: string
          day_of_week: number
          start_time: string
          end_time: string
          active?: boolean
        }
        Update: Partial<Omit<TherapistWorkScheduleBlock, 'id' | 'created_at'>>
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          name: string
          price_usd: number
          limits_json: PlanLimits
          cambios_included: number
          active: boolean
          created_at: string
          default_weekly_distribution_json: WeeklyDistribution | null
          unified_content_limit: number | null
          n1co_plan_id: string | null
          n1co_payment_link_static_sandbox: string | null
          n1co_payment_link_static_prod: string | null
          n1co_synced_at: string | null
        }
        Insert: {
          id?: string
          name: string
          price_usd: number
          limits_json: PlanLimits
          cambios_included?: number
          active?: boolean
          default_weekly_distribution_json?: WeeklyDistribution | null
          unified_content_limit?: number | null
          n1co_plan_id?: string | null
          n1co_payment_link_static_sandbox?: string | null
          n1co_payment_link_static_prod?: string | null
          n1co_synced_at?: string | null
        }
        Update: {
          name?: string
          price_usd?: number
          limits_json?: PlanLimits
          cambios_included?: number
          active?: boolean
          default_weekly_distribution_json?: WeeklyDistribution | null
          unified_content_limit?: number | null
          n1co_plan_id?: string | null
          n1co_payment_link_static_sandbox?: string | null
          n1co_payment_link_static_prod?: string | null
          n1co_synced_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          logo_url: string | null
          contact_email: string | null
          contact_phone: string | null
          ig_handle: string | null
          fb_handle: string | null
          tiktok_handle: string | null
          yt_handle: string | null
          linkedin_handle: string | null
          website_url: string | null
          other_contact: string | null
          notes: string | null
          current_plan_id: string
          billing_day: number
          billing_day_2: number | null
          start_date: string
          status: ClientStatus
          created_at: string
          updated_at: string
          weekly_targets_json: Partial<Record<ContentType, number>> | null
          weekly_distribution_json: WeeklyDistribution | null
          billing_period: BillingPeriod
          legal_name: string | null
          person_type: PersonType | null
          nit: string | null
          nrc: string | null
          dui: string | null
          fiscal_address: string | null
          giro: string | null
          country_code: string | null
          default_tax_rate: number | null
          auto_billing: boolean
          aplica_renta_retenida: boolean
          max_cambios: number
          is_foreign: boolean
          n1co_customer_id: string | null
          n1co_subscription_id: string | null
          n1co_payment_method_id: string | null
          n1co_subscription_status: N1coSubscriptionStatus | null
          n1co_subscription_started_at: string | null
          n1co_subscription_cancelled_at: string | null
        }
        Insert: {
          id?: string
          name: string
          logo_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          ig_handle?: string | null
          fb_handle?: string | null
          tiktok_handle?: string | null
          yt_handle?: string | null
          linkedin_handle?: string | null
          website_url?: string | null
          other_contact?: string | null
          notes?: string | null
          current_plan_id: string
          billing_day: number
          billing_day_2?: number | null
          start_date: string
          status?: ClientStatus
          weekly_targets_json?: Partial<Record<ContentType, number>> | null
          weekly_distribution_json?: WeeklyDistribution | null
          billing_period?: BillingPeriod
          legal_name?: string | null
          person_type?: PersonType | null
          nit?: string | null
          nrc?: string | null
          dui?: string | null
          fiscal_address?: string | null
          giro?: string | null
          country_code?: string | null
          default_tax_rate?: number | null
          auto_billing?: boolean
          aplica_renta_retenida?: boolean
          max_cambios?: number
          is_foreign?: boolean
          n1co_customer_id?: string | null
          n1co_subscription_id?: string | null
          n1co_payment_method_id?: string | null
          n1co_subscription_status?: N1coSubscriptionStatus | null
          n1co_subscription_started_at?: string | null
          n1co_subscription_cancelled_at?: string | null
        }
        Update: {
          name?: string
          logo_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          ig_handle?: string | null
          fb_handle?: string | null
          tiktok_handle?: string | null
          yt_handle?: string | null
          linkedin_handle?: string | null
          website_url?: string | null
          other_contact?: string | null
          notes?: string | null
          current_plan_id?: string
          billing_day?: number
          billing_day_2?: number | null
          start_date?: string
          status?: ClientStatus
          weekly_targets_json?: Partial<Record<ContentType, number>> | null
          weekly_distribution_json?: WeeklyDistribution | null
          billing_period?: BillingPeriod
          legal_name?: string | null
          person_type?: PersonType | null
          nit?: string | null
          nrc?: string | null
          dui?: string | null
          fiscal_address?: string | null
          giro?: string | null
          country_code?: string | null
          default_tax_rate?: number | null
          auto_billing?: boolean
          aplica_renta_retenida?: boolean
          max_cambios?: number
          is_foreign?: boolean
          n1co_customer_id?: string | null
          n1co_subscription_id?: string | null
          n1co_payment_method_id?: string | null
          n1co_subscription_status?: N1coSubscriptionStatus | null
          n1co_subscription_started_at?: string | null
          n1co_subscription_cancelled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'clients_current_plan_id_fkey'
            columns: ['current_plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          }
        ]
      }
      billing_cycles: {
        Row: {
          id: string
          client_id: string
          plan_id_snapshot: string
          limits_snapshot_json: PlanLimits
          rollover_from_previous_json: Partial<PlanLimits> | null
          period_start: string
          period_end: string
          status: CycleStatus
          payment_status: PaymentStatus
          payment_date: string | null
          payment_status_2: PaymentStatus | null
          payment_date_2: string | null
          created_at: string
          cambios_budget: number
          cambios_packages_json: CambiosPackage[]
          extra_content_json: ExtraContentItem[]
          content_limits_override_json: Partial<Record<ContentType, number>> | null
          weekly_distribution_override_json: WeeklyDistribution | null
          /** Timestamp del momento en que se emitió factura para este ciclo (manual o cron). */
          auto_billed_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          plan_id_snapshot: string
          limits_snapshot_json: PlanLimits
          rollover_from_previous_json?: Partial<PlanLimits> | null
          period_start: string
          period_end: string
          status?: CycleStatus
          payment_status?: PaymentStatus
          payment_date?: string | null
          payment_status_2?: PaymentStatus | null
          payment_date_2?: string | null
          cambios_budget?: number
          cambios_packages_json?: CambiosPackage[]
          extra_content_json?: ExtraContentItem[]
          content_limits_override_json?: Partial<Record<ContentType, number>> | null
          weekly_distribution_override_json?: WeeklyDistribution | null
          auto_billed_at?: string | null
        }
        Update: {
          client_id?: string
          plan_id_snapshot?: string
          limits_snapshot_json?: PlanLimits
          rollover_from_previous_json?: Partial<PlanLimits> | null
          period_start?: string
          period_end?: string
          status?: CycleStatus
          payment_status?: PaymentStatus
          payment_date?: string | null
          payment_status_2?: PaymentStatus | null
          payment_date_2?: string | null
          cambios_budget?: number
          cambios_packages_json?: CambiosPackage[]
          extra_content_json?: ExtraContentItem[]
          content_limits_override_json?: Partial<Record<ContentType, number>> | null
          weekly_distribution_override_json?: WeeklyDistribution | null
          auto_billed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'billing_cycles_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          }
        ]
      }
      requirements: {
        Row: {
          id: string
          billing_cycle_id: string
          content_type: ContentType
          registered_by_user_id: string
          registered_at: string
          notes: string | null
          voided: boolean
          voided_by_user_id: string | null
          voided_at: string | null
          over_limit: boolean
          phase: Phase
          carried_over: boolean
          title: string
          cambios_count: number
          review_started_at: string | null
          priority: Priority
          estimated_time_minutes: number | null
          assigned_to: string[] | null
          includes_story: boolean
          deadline: string | null
          starts_at: string | null
          consumption_overrides_json: Partial<Record<ContentType, number>> | null
          paid_from_credit_id: string | null
          approval_status: RequirementApprovalStatus
          requested_by_user_id: string | null
          client_requested_deadline: string | null
          client_requested_notes: string | null
          approved_by_user_id: string | null
          approved_at: string | null
          rejected_reason: string | null
          rejected_at: string | null
          rejected_by_user_id: string | null
        }
        Insert: {
          id?: string
          billing_cycle_id: string
          content_type: ContentType
          registered_by_user_id: string
          registered_at?: string
          notes?: string | null
          voided?: boolean
          voided_by_user_id?: string | null
          voided_at?: string | null
          over_limit?: boolean
          phase?: Phase
          carried_over?: boolean
          title?: string
          cambios_count?: number
          review_started_at?: string | null
          priority?: Priority
          estimated_time_minutes?: number | null
          assigned_to?: string[] | null
          includes_story?: boolean
          deadline?: string | null
          starts_at?: string | null
          consumption_overrides_json?: Partial<Record<ContentType, number>> | null
          paid_from_credit_id?: string | null
          approval_status?: RequirementApprovalStatus
          requested_by_user_id?: string | null
          client_requested_deadline?: string | null
          client_requested_notes?: string | null
          approved_by_user_id?: string | null
          approved_at?: string | null
          rejected_reason?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
        }
        Update: {
          billing_cycle_id?: string
          content_type?: ContentType
          registered_by_user_id?: string
          notes?: string | null
          voided?: boolean
          voided_by_user_id?: string | null
          voided_at?: string | null
          over_limit?: boolean
          phase?: Phase
          carried_over?: boolean
          title?: string
          cambios_count?: number
          review_started_at?: string | null
          priority?: Priority
          estimated_time_minutes?: number | null
          assigned_to?: string[] | null
          includes_story?: boolean
          deadline?: string | null
          starts_at?: string | null
          consumption_overrides_json?: Partial<Record<ContentType, number>> | null
          paid_from_credit_id?: string | null
          approval_status?: RequirementApprovalStatus
          requested_by_user_id?: string | null
          client_requested_deadline?: string | null
          client_requested_notes?: string | null
          approved_by_user_id?: string | null
          approved_at?: string | null
          rejected_reason?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'requirements_billing_cycle_id_fkey'
            columns: ['billing_cycle_id']
            isOneToOne: false
            referencedRelation: 'billing_cycles'
            referencedColumns: ['id']
          }
        ]
      }
      requirement_phase_logs: {
        Row: {
          id: string
          requirement_id: string
          from_phase: Phase | null
          to_phase: Phase
          moved_by: string | null
          notes: string | null
          created_at: string
          ended_at: string | null
          standby_seconds: number | null
          worked_seconds: number | null
        }
        Insert: {
          id?: string
          requirement_id: string
          from_phase?: Phase | null
          to_phase: Phase
          moved_by?: string | null
          notes?: string | null
          created_at?: string
          ended_at?: string | null
          standby_seconds?: number | null
          worked_seconds?: number | null
        }
        Update: {
          ended_at?: string | null
          standby_seconds?: number | null
          worked_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'requirement_phase_logs_requirement_id_fkey'
            columns: ['requirement_id']
            isOneToOne: false
            referencedRelation: 'requirements'
            referencedColumns: ['id']
          }
        ]
      }
      requirement_cambio_logs: {
        Row: {
          id: string
          requirement_id: string
          notes: string | null
          created_by: string | null
          created_at: string
          voided: boolean
          voided_by_user_id: string | null
          voided_at: string | null
          /** 'pending' = esperando aprobación; 'approved' = contabilizado; 'rejected' = rechazado */
          status: 'pending' | 'approved' | 'rejected'
          paid_from_credit_id: string | null
        }
        Insert: {
          id?: string
          requirement_id: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          voided?: boolean
          voided_by_user_id?: string | null
          voided_at?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          paid_from_credit_id?: string | null
        }
        Update: {
          voided?: boolean
          voided_by_user_id?: string | null
          voided_at?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          paid_from_credit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'requirement_cambio_logs_requirement_id_fkey'
            columns: ['requirement_id']
            isOneToOne: false
            referencedRelation: 'requirements'
            referencedColumns: ['id']
          }
        ]
      }
      requirement_messages: {
        Row: {
          id: string
          requirement_id: string
          user_id: string
          body: string
          created_at: string
          attachment_path: string | null
          attachment_type: string | null
          attachment_name: string | null
          visible_to_client: boolean
        }
        Insert: {
          id?: string
          requirement_id: string
          user_id: string
          body: string
          created_at?: string
          attachment_path?: string | null
          attachment_type?: string | null
          attachment_name?: string | null
          visible_to_client?: boolean
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'requirement_messages_requirement_id_fkey'
            columns: ['requirement_id']
            isOneToOne: false
            referencedRelation: 'requirements'
            referencedColumns: ['id']
          }
        ]
      }
      time_entries: {
        Row: {
          id: string
          requirement_id: string | null
          user_id: string
          entry_type: TimeEntryType
          category: AdminCategory | null
          phase: string
          title: string
          started_at: string
          ended_at: string | null
          duration_seconds: number | null
          notes: string | null
          created_at: string
          scheduled_at: string | null
          scheduled_duration_minutes: number | null
          scheduled_attendees: string[]
        }
        Insert: {
          id?: string
          requirement_id?: string | null
          user_id: string
          entry_type?: TimeEntryType
          category?: AdminCategory | null
          phase?: string
          title?: string
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          notes?: string | null
          created_at?: string
          scheduled_at?: string | null
          scheduled_duration_minutes?: number | null
          scheduled_attendees?: string[]
        }
        Update: {
          requirement_id?: string | null
          entry_type?: TimeEntryType
          category?: AdminCategory | null
          phase?: string
          title?: string
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          notes?: string | null
          scheduled_at?: string | null
          scheduled_duration_minutes?: number | null
          scheduled_attendees?: string[]
        }
        Relationships: [
          {
            foreignKeyName: 'time_entries_requirement_id_fkey'
            columns: ['requirement_id']
            isOneToOne: false
            referencedRelation: 'requirements'
            referencedColumns: ['id']
          }
        ]
      }
      app_settings: {
        Row: {
          key: string
          value: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value?: string | null
          updated_at?: string
        }
        Update: {
          value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          type: ConversationType
          name: string | null
          description: string | null
          topic: string | null
          created_by: string | null
          created_at: string
          last_message_at: string
        }
        Insert: {
          id?: string
          type: ConversationType
          name?: string | null
          description?: string | null
          topic?: string | null
          created_by?: string | null
          created_at?: string
          last_message_at?: string
        }
        Update: {
          name?: string | null
          description?: string | null
          topic?: string | null
          last_message_at?: string
        }
        Relationships: []
      }
      conversation_members: {
        Row: {
          conversation_id: string
          user_id: string
          joined_at: string
          last_read_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          joined_at?: string
          last_read_at?: string
        }
        Update: {
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_members_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          }
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string | null
          body: string
          edited_at: string | null
          deleted_at: string | null
          created_at: string
          /** Tipo del mensaje (migración 0077). 'text' por default; los de sistema se pintan distinto. */
          kind: 'text' | 'system_missed_call'
          /** FK al mensaje original al que se responde (migración 0080). */
          reply_to_message_id: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id?: string | null
          body?: string
          edited_at?: string | null
          deleted_at?: string | null
          created_at?: string
          kind?: 'text' | 'system_missed_call'
          reply_to_message_id?: string | null
        }
        Update: {
          body?: string
          edited_at?: string | null
          deleted_at?: string | null
          kind?: 'text' | 'system_missed_call'
          reply_to_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          }
        ]
      }
      message_attachments: {
        Row: {
          id: string
          message_id: string
          storage_path: string
          file_name: string
          file_size: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          storage_path: string
          file_name: string
          file_size?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'message_attachments_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          }
        ]
      }
      requirement_mentions: {
        Row: {
          id: string
          message_id: string
          requirement_id: string
          mentioned_user_id: string
          mentioned_by_user_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          requirement_id: string
          mentioned_user_id: string
          mentioned_by_user_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'requirement_mentions_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'requirement_messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'requirement_mentions_requirement_id_fkey'
            columns: ['requirement_id']
            isOneToOne: false
            referencedRelation: 'requirements'
            referencedColumns: ['id']
          }
        ]
      }
      review_assets: {
        Row: {
          id: string
          requirement_id: string
          name: string
          kind: 'image' | 'video' | 'pdf'
          created_by: string | null
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          requirement_id: string
          name: string
          kind: 'image' | 'video' | 'pdf'
          created_by?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          name?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      review_versions: {
        Row: {
          id: string
          asset_id: string
          version_number: number
          storage_path: string
          mime_type: string
          byte_size: number
          thumbnail_path: string | null
          duration_ms: number | null
          uploaded_by: string | null
          uploaded_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          version_number: number
          storage_path: string
          mime_type: string
          byte_size: number
          thumbnail_path?: string | null
          duration_ms?: number | null
          uploaded_by?: string | null
          uploaded_at?: string
        }
        Update: {
          thumbnail_path?: string | null
          duration_ms?: number | null
        }
        Relationships: []
      }
      review_version_files: {
        Row: {
          id: string
          version_id: string
          file_order: number
          storage_path: string
          thumbnail_path: string | null
          mime_type: string
          byte_size: number
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          version_id: string
          file_order: number
          storage_path: string
          thumbnail_path?: string | null
          mime_type: string
          byte_size: number
          duration_ms?: number | null
          created_at?: string
        }
        Update: {
          file_order?: number
          thumbnail_path?: string | null
          duration_ms?: number | null
        }
        Relationships: []
      }
      review_pins: {
        Row: {
          id: string
          version_id: string
          file_id: string | null
          pin_number: number
          pos_x_pct: number
          pos_y_pct: number
          timestamp_ms: number | null
          page_number: number | null
          status: 'active' | 'resolved'
          created_by: string | null
          created_at: string
          resolved_by: string | null
          resolved_at: string | null
        }
        Insert: {
          id?: string
          version_id: string
          file_id?: string | null
          pin_number: number
          pos_x_pct: number
          pos_y_pct: number
          timestamp_ms?: number | null
          page_number?: number | null
          status?: 'active' | 'resolved'
          created_by?: string | null
          created_at?: string
          resolved_by?: string | null
          resolved_at?: string | null
        }
        Update: {
          status?: 'active' | 'resolved'
          resolved_by?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      review_comments: {
        Row: {
          id: string
          pin_id: string
          parent_id: string | null
          user_id: string | null
          body: string
          edited_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          pin_id: string
          parent_id?: string | null
          user_id?: string | null
          body: string
          edited_at?: string | null
          created_at?: string
        }
        Update: {
          body?: string
          edited_at?: string | null
        }
        Relationships: []
      }
      review_comment_mentions: {
        Row: {
          id: string
          comment_id: string
          requirement_id: string
          mentioned_user_id: string
          mentioned_by_user_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          comment_id: string
          requirement_id: string
          mentioned_user_id: string
          mentioned_by_user_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          read_at?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          id: string
          legal_name: string
          trade_name: string | null
          nit: string | null
          nrc: string | null
          fiscal_address: string | null
          giro: string | null
          phone: string | null
          email: string | null
          logo_url: string | null
          invoice_footer_note: string | null
          payment_methods_json: PaymentMethodConfig[]
          terms_and_conditions_json: TermAndCondition[]
          updated_at: string
          updated_by: string | null
          n1co_environment: N1coEnvironment
          n1co_location_code: string | null
          n1co_location_id: number | null
          n1co_webhook_secret_hint: string | null
        }
        Insert: {
          id?: string
          legal_name: string
          trade_name?: string | null
          nit?: string | null
          nrc?: string | null
          fiscal_address?: string | null
          giro?: string | null
          phone?: string | null
          email?: string | null
          logo_url?: string | null
          invoice_footer_note?: string | null
          payment_methods_json?: PaymentMethodConfig[]
          terms_and_conditions_json?: TermAndCondition[]
          updated_at?: string
          updated_by?: string | null
          n1co_environment?: N1coEnvironment
          n1co_location_code?: string | null
          n1co_location_id?: number | null
          n1co_webhook_secret_hint?: string | null
        }
        Update: {
          legal_name?: string
          trade_name?: string | null
          nit?: string | null
          nrc?: string | null
          fiscal_address?: string | null
          giro?: string | null
          phone?: string | null
          email?: string | null
          logo_url?: string | null
          invoice_footer_note?: string | null
          payment_methods_json?: PaymentMethodConfig[]
          terms_and_conditions_json?: TermAndCondition[]
          updated_at?: string
          updated_by?: string | null
          n1co_environment?: N1coEnvironment
          n1co_location_code?: string | null
          n1co_location_id?: number | null
          n1co_webhook_secret_hint?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          invoice_number: string
          client_id: string | null
          child_id: string | null
          billing_cycle_id: string | null
          quote_id: string | null
          issue_date: string
          due_date: string | null
          currency: string
          subtotal: number
          discount_amount: number
          tax_rate: number
          tax_amount: number
          retention_rate: number
          retencion_renta_amount: number
          total: number
          total_a_pagar: number
          status: InvoiceStatus
          payment_date: string | null
          payment_method: InvoicePaymentMethod | null
          payment_reference: string | null
          notes: string | null
          client_snapshot_json: ClientFiscalSnapshot
          emitter_snapshot_json: EmitterSnapshot
          void_reason: string | null
          void_by: string | null
          void_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          biweekly_half: 'first' | 'second' | null
          payment_provider: PaymentProvider
          n1co_payment_link_id: string | null
          n1co_payment_link_url: string | null
          n1co_order_reference: string | null
          n1co_order_id: string | null
          n1co_buyer_email: string | null
          n1co_buyer_name: string | null
          n1co_paid_at: string | null
          dte_codigo_generacion: string | null
          dte_numero_control: string | null
          dte_sello_recepcion: string | null
          dte_tipo: DteTipo | null
          dte_pdf_url: string | null
          dte_received_at: string | null
          extras_metadata: InvoiceExtrasMetadata | null
          terms_snapshot_json: TermAndCondition[] | null
        }
        Insert: {
          id?: string
          invoice_number: string
          client_id?: string | null
          child_id?: string | null
          billing_cycle_id?: string | null
          quote_id?: string | null
          issue_date?: string
          due_date?: string | null
          currency?: string
          subtotal?: number
          discount_amount?: number
          tax_rate?: number
          tax_amount?: number
          retention_rate?: number
          retencion_renta_amount?: number
          total?: number
          total_a_pagar?: number
          status?: InvoiceStatus
          payment_date?: string | null
          payment_method?: InvoicePaymentMethod | null
          payment_reference?: string | null
          notes?: string | null
          client_snapshot_json: ClientFiscalSnapshot
          emitter_snapshot_json: EmitterSnapshot
          void_reason?: string | null
          void_by?: string | null
          void_at?: string | null
          created_by?: string | null
          biweekly_half?: 'first' | 'second' | null
          payment_provider?: PaymentProvider
          n1co_payment_link_id?: string | null
          n1co_payment_link_url?: string | null
          n1co_order_reference?: string | null
          n1co_order_id?: string | null
          n1co_buyer_email?: string | null
          n1co_buyer_name?: string | null
          n1co_paid_at?: string | null
          dte_codigo_generacion?: string | null
          dte_numero_control?: string | null
          dte_sello_recepcion?: string | null
          dte_tipo?: DteTipo | null
          dte_pdf_url?: string | null
          dte_received_at?: string | null
          extras_metadata?: InvoiceExtrasMetadata | null
          terms_snapshot_json?: TermAndCondition[] | null
        }
        Update: {
          invoice_number?: string
          client_id?: string | null
          child_id?: string | null
          billing_cycle_id?: string | null
          quote_id?: string | null
          issue_date?: string
          due_date?: string | null
          currency?: string
          subtotal?: number
          discount_amount?: number
          tax_rate?: number
          tax_amount?: number
          retention_rate?: number
          retencion_renta_amount?: number
          total?: number
          total_a_pagar?: number
          status?: InvoiceStatus
          payment_date?: string | null
          payment_method?: InvoicePaymentMethod | null
          payment_reference?: string | null
          notes?: string | null
          client_snapshot_json?: ClientFiscalSnapshot
          emitter_snapshot_json?: EmitterSnapshot
          void_reason?: string | null
          void_by?: string | null
          void_at?: string | null
          biweekly_half?: 'first' | 'second' | null
          payment_provider?: PaymentProvider
          n1co_payment_link_id?: string | null
          n1co_payment_link_url?: string | null
          n1co_order_reference?: string | null
          n1co_order_id?: string | null
          n1co_buyer_email?: string | null
          n1co_buyer_name?: string | null
          n1co_paid_at?: string | null
          dte_codigo_generacion?: string | null
          dte_numero_control?: string | null
          dte_sello_recepcion?: string | null
          dte_tipo?: DteTipo | null
          dte_pdf_url?: string | null
          dte_received_at?: string | null
          extras_metadata?: InvoiceExtrasMetadata | null
        }
        Relationships: []
      }
      n1co_payment_events: {
        Row: {
          id: string
          event_type: string
          order_id: string | null
          order_reference: string | null
          payment_link_id: string | null
          subscription_id: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          buyer_external_id: string | null
          metadata_json: Record<string, unknown> | null
          raw_payload_json: Record<string, unknown>
          hmac_signature: string | null
          signature_valid: boolean | null
          matched_invoice_id: string | null
          matched_client_id: string | null
          matching_strategy: string | null
          processed: boolean
          process_error: string | null
          received_at: string
        }
        Insert: {
          id?: string
          event_type: string
          order_id?: string | null
          order_reference?: string | null
          payment_link_id?: string | null
          subscription_id?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          buyer_external_id?: string | null
          metadata_json?: Record<string, unknown> | null
          raw_payload_json: Record<string, unknown>
          hmac_signature?: string | null
          signature_valid?: boolean | null
          matched_invoice_id?: string | null
          matched_client_id?: string | null
          matching_strategy?: string | null
          processed?: boolean
          process_error?: string | null
          received_at?: string
        }
        Update: {
          matched_invoice_id?: string | null
          matched_client_id?: string | null
          matching_strategy?: string | null
          processed?: boolean
          process_error?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string
          description: string
          quantity: number
          unit_price: number
          line_total: number
          sort_order: number
          service_catalog_id: string | null
          service_code: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          description: string
          quantity?: number
          unit_price: number
          line_total: number
          sort_order?: number
          service_catalog_id?: string | null
          service_code?: string | null
        }
        Update: {
          description?: string
          quantity?: number
          unit_price?: number
          line_total?: number
          sort_order?: number
          service_catalog_id?: string | null
          service_code?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          id: string
          quote_number: string
          /** null cuando es una propuesta a un prospecto sin cliente creado (migración 0075). */
          client_id: string | null
          issue_date: string
          valid_until: string | null
          currency: string
          subtotal: number
          discount_amount: number
          tax_rate: number
          tax_amount: number
          retention_rate: number
          retencion_renta_amount: number
          total: number
          total_a_pagar: number
          status: QuoteStatus
          notes: string | null
          client_snapshot_json: ClientFiscalSnapshot
          emitter_snapshot_json: EmitterSnapshot
          terms_snapshot_json: TermAndCondition[]
          converted_invoice_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          quote_number: string
          client_id?: string | null
          issue_date?: string
          valid_until?: string | null
          currency?: string
          subtotal?: number
          discount_amount?: number
          tax_rate?: number
          tax_amount?: number
          retention_rate?: number
          retencion_renta_amount?: number
          total?: number
          total_a_pagar?: number
          status?: QuoteStatus
          notes?: string | null
          client_snapshot_json: ClientFiscalSnapshot
          emitter_snapshot_json: EmitterSnapshot
          terms_snapshot_json?: TermAndCondition[]
          converted_invoice_id?: string | null
          created_by?: string | null
        }
        Update: {
          quote_number?: string
          issue_date?: string
          valid_until?: string | null
          currency?: string
          subtotal?: number
          discount_amount?: number
          tax_rate?: number
          tax_amount?: number
          retention_rate?: number
          retencion_renta_amount?: number
          total?: number
          total_a_pagar?: number
          status?: QuoteStatus
          notes?: string | null
          terms_snapshot_json?: TermAndCondition[]
          converted_invoice_id?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          id: string
          quote_id: string
          description: string
          quantity: number
          unit_price: number
          line_total: number
          sort_order: number
          service_catalog_id: string | null
          service_code: string | null
        }
        Insert: {
          id?: string
          quote_id: string
          description: string
          quantity?: number
          unit_price: number
          line_total: number
          sort_order?: number
          service_catalog_id?: string | null
          service_code?: string | null
        }
        Update: {
          description?: string
          quantity?: number
          unit_price?: number
          line_total?: number
          sort_order?: number
          service_catalog_id?: string | null
          service_code?: string | null
        }
        Relationships: []
      }
      client_users: {
        Row: {
          id: string
          user_id: string
          client_id: string
          role: ClientUserRole
          can_billing: boolean
          can_work: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          role?: ClientUserRole
          can_billing?: boolean
          can_work?: boolean
          created_at?: string
        }
        Update: {
          role?: ClientUserRole
          can_billing?: boolean
          can_work?: boolean
        }
        Relationships: []
      }
      client_credits: {
        Row: {
          id: string
          client_id: string
          kind: CreditKind
          qty_initial: number
          qty_remaining: number
          unit_price_usd: number
          source_invoice_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          kind: CreditKind
          qty_initial: number
          qty_remaining: number
          unit_price_usd?: number
          source_invoice_id?: string | null
          notes?: string | null
        }
        Update: {
          qty_remaining?: number
          notes?: string | null
        }
        Relationships: []
      }
      work_sessions: {
        Row: {
          id: string
          user_id: string
          started_at: string
          ended_at: string | null
          status: WorkSessionStatus
          notes: string | null
          breaks_json: WorkSessionBreak[]
          total_seconds: number | null
          productive_seconds: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          started_at?: string
          ended_at?: string | null
          status?: WorkSessionStatus
          notes?: string | null
          breaks_json?: WorkSessionBreak[]
          total_seconds?: number | null
          productive_seconds?: number | null
        }
        Update: {
          ended_at?: string | null
          status?: WorkSessionStatus
          notes?: string | null
          breaks_json?: WorkSessionBreak[]
          total_seconds?: number | null
          productive_seconds?: number | null
        }
        Relationships: []
      }
      impersonation_logs: {
        Row: {
          id: string
          admin_user_id: string
          target_user_id: string
          started_at: string
          ended_at: string | null
        }
        Insert: {
          id?: string
          admin_user_id: string
          target_user_id: string
          started_at?: string
          ended_at?: string | null
        }
        Update: {
          ended_at?: string | null
        }
        Relationships: []
      }
      renewal_requests: {
        Row: {
          id: string
          client_id: string
          requested_by: string
          from_cycle_id: string | null
          status: RenewalRequestStatus
          rollover_items_json: Array<{ requirement_id: string; action: 'carry' | 'drop' }>
          addons_json: Record<string, unknown>
          admin_notes: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
        }
        Insert: {
          id?: string
          client_id: string
          requested_by: string
          from_cycle_id?: string | null
          status?: RenewalRequestStatus
          rollover_items_json?: Array<{ requirement_id: string; action: 'carry' | 'drop' }>
          addons_json?: Record<string, unknown>
          admin_notes?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
        }
        Update: {
          from_cycle_id?: string | null
          status?: RenewalRequestStatus
          rollover_items_json?: Array<{ requirement_id: string; action: 'carry' | 'drop' }>
          addons_json?: Record<string, unknown>
          admin_notes?: string | null
          decided_at?: string | null
          decided_by?: string | null
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          id: string
          conversation_id: string
          started_by: string
          started_at: string
          ended_at: string | null
          livekit_room_name: string
          modality: CallModality
        }
        Insert: {
          id?: string
          conversation_id: string
          started_by: string
          started_at?: string
          ended_at?: string | null
          livekit_room_name: string
          modality?: CallModality
        }
        Update: {
          ended_at?: string | null
          modality?: CallModality
        }
        Relationships: []
      }
      call_participants: {
        Row: {
          session_id: string
          user_id: string
          joined_at: string
          left_at: string | null
        }
        Insert: {
          session_id: string
          user_id: string
          joined_at?: string
          left_at?: string | null
        }
        Update: {
          left_at?: string | null
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          user_id: string
          status: PresenceStatus
          updated_at: string
        }
        Insert: {
          user_id: string
          status?: PresenceStatus
          updated_at?: string
        }
        Update: {
          status?: PresenceStatus
          updated_at?: string
        }
        Relationships: []
      }
      // ── Kinetic tables (mig 0091+) ─────────────────────────────────────────
      families: {
        Row: AsRow<Family>
        Insert: {
          id?: string
          code?: string | null
          primary_contact_name: string
          primary_contact_email?: string | null
          primary_contact_phone?: string | null
          secondary_contact_name?: string | null
          secondary_contact_phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          fiscal_legal_name?: string | null
          fiscal_nit?: string | null
          fiscal_dui?: string | null
          fiscal_address?: string | null
          status?: FamilyStatus
          notes?: string | null
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<Family, 'id' | 'created_at'>>
        Relationships: []
      }
      family_users: {
        Row: AsRow<FamilyUser>
        Insert: {
          id?: string
          family_id: string
          user_id: string
          role?: FamilyUserRole
          can_billing?: boolean
          can_work?: boolean
        }
        Update: Partial<Omit<FamilyUser, 'id' | 'created_at'>>
        Relationships: []
      }
      referral_sources: {
        Row: AsRow<ReferralSource>
        Insert: {
          id?: string
          type: ReferralSourceType
          name: string
          contact_name?: string | null
          contact_phone?: string | null
          contact_email?: string | null
          specialty?: string | null
          address?: string | null
          notes?: string | null
          can_receive_reports?: boolean
          partnership_active?: boolean
        }
        Update: Partial<Omit<ReferralSource, 'id' | 'created_at'>>
        Relationships: []
      }
      children: {
        Row: AsRow<Child>
        Insert: {
          id?: string
          family_id: string
          code?: string | null
          full_name: string
          preferred_name?: string | null
          birth_date?: string | null
          gender?: 'M' | 'F' | 'other' | null
          blood_type?: string | null
          allergies_text?: string | null
          medications_text?: string | null
          preferred_hospital?: string | null
          school_name?: string | null
          school_grade?: string | null
          diagnoses_json?: DiagnosisCode[]
          diagnoses_display_text?: string | null
          referral_source_type?: ReferralSourceType | null
          referral_source_id?: string | null
          referral_notes?: string | null
          enrolled_program?: MorningProgram | null
          enrollment_started_at?: string | null
          enrollment_ended_at?: string | null
          notes?: string | null
          photo_url?: string | null
          created_by_user_id?: string | null
          current_phase_code?: string | null
        }
        Update: Partial<Omit<Child, 'id' | 'created_at'>>
        Relationships: []
      }
      appointments: {
        Row: AsRow<Appointment>
        Insert: {
          id?: string
          child_id?: string | null
          external_child_name?: string | null
          service_code?: string | null
          therapist_id?: string | null
          event_type: EventType
          service_type?: ServiceType | null
          modality?: Modality
          starts_at: string
          ends_at: string
          status?: AppointmentStatus
          parent_appointment_id?: string | null
          recurrence_rule?: string | null
          google_calendar_event_id?: string | null
          meet_link?: string | null
          notification_sent_24h?: boolean
          notification_sent_1h?: boolean
          notes?: string | null
          is_extra?: boolean
          extra_reason?: ExtraReason | null
          dispatch_type?: 'internal' | 'to_reception' | 'to_parent' | null
          handed_to_reception_at?: string | null
          program_group_id?: string | null
          custom_event_label?: string | null
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<Appointment, 'id' | 'created_at'>>
        Relationships: []
      }
      institutional_calendar: {
        Row: AsRow<InstitutionalClosure>
        Insert: {
          id?: string
          date: string
          type: InstitutionalClosureType
          name: string
          description?: string | null
          all_day?: boolean
          year_recurring?: boolean
        }
        Update: Partial<Omit<InstitutionalClosure, 'id' | 'created_at'>>
        Relationships: []
      }
      virtual_meetings: {
        Row: AsRow<VirtualMeeting>
        Insert: {
          id?: string
          appointment_id?: string | null
          context: VirtualMeeting['context']
          provider?: 'google_meet'
          external_event_id?: string | null
          join_url?: string | null
          scheduled_for: string
          ends_at?: string | null
          status?: VirtualMeeting['status']
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<VirtualMeeting, 'id' | 'created_at'>>
        Relationships: []
      }
      therapy_sessions: {
        Row: AsRow<TherapySession>
        Insert: {
          id?: string
          appointment_id: string
          therapist_id: string
          child_id: string
          started_at?: string
          ended_at?: string | null
          status?: 'active' | 'completed'
        }
        Update: Partial<Omit<TherapySession, 'id' | 'created_at'>>
        Relationships: []
      }
      child_journal_entries: {
        Row: AsRow<ChildJournalEntry>
        Insert: {
          id?: string
          child_id: string
          author_user_id?: string | null
          category: JournalCategory
          body: string
          attachments_json?: unknown[]
          visible_to_family?: boolean
          linked_appointment_id?: string | null
        }
        Update: Partial<Omit<ChildJournalEntry, 'id' | 'created_at'>>
        Relationships: []
      }
      session_reports: {
        Row: AsRow<SessionReport>
        Insert: {
          id?: string
          session_id: string
          appointment_id: string
          child_id: string
          therapist_id?: string | null
          actividades?: string
          respuesta_del_nino?: string
          tarea_para_casa?: string
          observaciones_internas?: string
          visible_to_family?: boolean
          status?: SessionReportStatus
          upload_kind?: 'editor' | 'file'
          file_url?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_mime_type?: string | null
        }
        Update: Partial<Omit<SessionReport, 'id' | 'created_at'>>
        Relationships: []
      }
      progress_reports: {
        Row: AsRow<ProgressReport>
        Insert: {
          id?: string
          child_id: string
          service_type: string
          period_starts: string
          period_ends: string
          authored_by_user_id?: string | null
          sessions_attended_count?: number
          data_json?: ProgressReportData
          status?: ProgressReportStatus
          visible_to_family?: boolean
          template_id?: string | null
          upload_kind?: 'editor' | 'file'
          file_url?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_mime_type?: string | null
          family_notes?: string | null
        }
        Update: Partial<Omit<ProgressReport, 'id' | 'created_at'>>
        Relationships: []
      }
      report_templates: {
        Row: AsRow<ReportTemplate>
        Insert: {
          id?: string
          name: string
          kind: ReportTemplateKind
          service_type?: string | null
          blocks_json: ReportTemplateBlock[]
          default_signers_role?: string | null
          active?: boolean
          version?: number
          created_by?: string | null
        }
        Update: Partial<Omit<ReportTemplate, 'id' | 'created_at'>>
        Relationships: []
      }
      waitlist_entries: {
        Row: AsRow<WaitlistEntry>
        Insert: {
          id?: string
          child_full_name: string
          child_birthdate?: string | null
          child_diagnosis?: string | null
          parent_full_name: string
          parent_phone: string
          parent_email?: string | null
          requested_service_type: ServiceType
          preferred_therapist_id?: string | null
          preferred_days?: string | null
          notes?: string | null
          referral_source_id?: string | null
          priority?: number
          added_by_user_id?: string | null
          contacted_at?: string | null
          contacted_by_user_id?: string | null
          dropped_at?: string | null
          dropped_reason?: string | null
          scheduled_child_id?: string | null
          current_phase_code?: string | null
          child_age_text?: string | null
          has_previous_evaluation?: boolean | null
          referral_channel?: ReferralChannel | null
          referral_channel_other?: string | null
          interest_text?: string | null
        }
        Update: Partial<Omit<WaitlistEntry, 'id' | 'added_at'>>
        Relationships: []
      }
      intake_phase_catalog: {
        Row: AsRow<IntakePhaseCatalogEntry>
        Insert: Omit<IntakePhaseCatalogEntry, 'created_at'> & { created_at?: string }
        Update: Partial<Omit<IntakePhaseCatalogEntry, 'code' | 'created_at'>>
        Relationships: []
      }
      child_phase_history: {
        Row: AsRow<ChildPhaseHistoryEntry>
        Insert: {
          id?: string
          child_id?: string | null
          waitlist_entry_id?: string | null
          from_phase_code?: string | null
          to_phase_code: string
          notes?: string | null
          changed_by_user_id?: string | null
          changed_at?: string
        }
        Update: Partial<Omit<ChildPhaseHistoryEntry, 'id' | 'changed_at'>>
        Relationships: []
      }
      child_discharge_records: {
        Row: AsRow<ChildDischargeRecord>
        Insert: {
          id?: string
          child_id: string
          discharge_type: DischargeType
          discharge_date?: string
          child_snapshot_json?: DischargeChildSnapshot
          therapies_snapshot_json?: DischargeTherapySnapshot[]
          total_sessions_attended?: number | null
          attendance_rate_pct?: number | null
          total_replacements?: number | null
          objectives_achieved?: string | null
          recommendations?: string | null
          follow_up_plan?: string | null
          discharge_reason?: string | null
          signed_by_therapist_id?: string | null
          signed_by_therapist_name?: string | null
          signed_by_therapist_at?: string | null
          signed_by_directora_id?: string | null
          signed_by_directora_name?: string | null
          signed_by_directora_at?: string | null
          status?: DischargeStatus
          pdf_generated_at?: string | null
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<ChildDischargeRecord, 'id' | 'created_at'>>
        Relationships: []
      }
      dashboard_alerts: {
        Row: AsRow<DashboardAlert>
        Insert: {
          id?: string
          alert_type: DashboardAlertType
          child_id?: string | null
          message: string
          visible_to_roles?: string[]
          expires_at: string
          created_by_user_id?: string | null
        }
        Update: Partial<Omit<DashboardAlert, 'id' | 'created_at'>>
        Relationships: []
      }
      treatment_plans: {
        Row: AsRow<TreatmentPlan>
        Insert: {
          id?: string
          child_id: string
          primary_therapist_id?: string | null
          diagnosis_text?: string | null
          starts_at?: string | null
          age_at_start_text?: string | null
          therapies_json?: TreatmentPlanTherapyEntry[]
          schedule_pattern_json?: TreatmentPlanScheduleSlot[]
          observations?: string | null
          monthly_total_usd?: number | null
          signed_at?: string | null
          signed_by_user_id?: string | null
          active?: boolean
          created_by_user_id?: string | null
          updated_by_user_id?: string | null
          discount_kind?: DiscountKind
          discount_value?: number
          discount_reason?: string | null
        }
        Update: Partial<Omit<TreatmentPlan, 'id' | 'created_at'>>
        Relationships: []
      }
      treatment_plan_changes: {
        Row: AsRow<TreatmentPlanChange>
        Insert: {
          id?: string
          treatment_plan_id: string
          changed_by_user_id?: string | null
          before_json: Partial<TreatmentPlan>
          after_json: Partial<TreatmentPlan>
          kind: TreatmentPlanChangeKind
          notes?: string | null
        }
        Update: never
        Relationships: []
      }
      appointment_absences: {
        Row: AsRow<AppointmentAbsence>
        Insert: {
          id?: string
          appointment_id: string
          child_id: string
          therapist_id?: string | null
          reported_by_user_id?: string | null
          reason?: string | null
          status?: AppointmentAbsenceStatus
          replacement_appointment_id?: string | null
          waive_reason?: string | null
        }
        Update: Partial<Omit<AppointmentAbsence, 'id' | 'created_at'>>
        Relationships: []
      }
      monthly_session_cycles: {
        Row: AsRow<MonthlySessionCycle>
        Insert: {
          id?: string
          child_id: string
          period_month: string                         // YYYY-MM-01
          treatment_plan_snapshot: Record<string, unknown>
          paid_at?: string
          paid_by_user_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_amount_usd: number
          invoice_id?: string | null
          appointments_generated_at?: string | null
          appointments_generated_count?: number
          status?: MonthlySessionCycleStatus
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          notes?: string | null
          discount_kind?: DiscountKind
          discount_value?: number
          discount_reason?: string | null
          program_group_id?: string | null
          attendance_days?: string[] | null
        }
        Update: Partial<Omit<MonthlySessionCycle, 'id' | 'created_at'>>
        Relationships: []
      }
      service_catalog: {
        Row: AsRow<ServiceCatalogItem>
        Insert: {
          id?: string
          code: string
          category: ServiceCategory
          name: string
          description?: string | null
          unit_price_usd: number
          unit_price_bk_usd?: number | null
          cost_usd?: number | null
          service_type?: ServiceType | null
          duration_minutes?: number | null
          morning_program?: MorningProgram | null
          days_per_week?: number | null
          proration_group?: string | null
          applies_from_month?: number | null
          applies_to_month?: number | null
          active?: boolean
          sort_order?: number
          notes?: string | null
        }
        Update: Partial<Omit<ServiceCatalogItem, 'id' | 'created_at'>>
        Relationships: []
      }
      program_groups: {
        Row: AsRow<ProgramGroup>
        Insert: {
          id?: string
          program: MorningProgram
          name: string
          active?: boolean
          meeting_days?: string[]
          start_time_local?: string
          duration_minutes?: number
        }
        Update: Partial<Omit<ProgramGroup, 'id' | 'created_at'>>
        Relationships: []
      }
      program_group_staff: {
        Row: AsRow<ProgramGroupStaff>
        Insert: {
          group_id: string
          user_id: string
          is_lead?: boolean
        }
        Update: Partial<ProgramGroupStaff>
        Relationships: []
      }
      program_group_members: {
        Row: AsRow<ProgramGroupMember>
        Insert: {
          id?: string
          group_id: string
          child_id: string
          attendance_days?: string[]
          active?: boolean
        }
        Update: Partial<Omit<ProgramGroupMember, 'id' | 'created_at'>>
        Relationships: []
      }
      program_group_sessions: {
        Row: AsRow<ProgramGroupSession>
        Insert: {
          id?: string
          group_id: string
          session_date: string
          starts_at: string
          ends_at: string
          status?: ProgramGroupSessionStatus
        }
        Update: Partial<Omit<ProgramGroupSession, 'id' | 'created_at'>>
        Relationships: []
      }
      program_session_attendance: {
        Row: AsRow<ProgramSessionAttendance>
        Insert: {
          id?: string
          session_id: string
          child_id: string
          status?: ProgramAttendanceStatus
          marked_by_user_id?: string | null
          marked_at?: string
          note?: string | null
        }
        Update: Partial<Omit<ProgramSessionAttendance, 'id'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    /** Catch-all: aceptar cualquier RPC sin tipar Args/Returns. */
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: Record<string, never>
  }
}

/* ── Derived / joined types used throughout the app ── */

export type Plan = Database['public']['Tables']['plans']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type BillingCycle = Database['public']['Tables']['billing_cycles']['Row']
export type Requirement = Database['public']['Tables']['requirements']['Row']
export type RequirementPhaseLog = Database['public']['Tables']['requirement_phase_logs']['Row']
export type RequirementCambioLog = Database['public']['Tables']['requirement_cambio_logs']['Row']
export type RequirementMessage = Database['public']['Tables']['requirement_messages']['Row']
export type TimeEntry = Database['public']['Tables']['time_entries']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type ConversationMember = Database['public']['Tables']['conversation_members']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type MessageAttachment = Database['public']['Tables']['message_attachments']['Row']
export type RequirementMention = Database['public']['Tables']['requirement_mentions']['Row']
export type ReviewCommentMention = Database['public']['Tables']['review_comment_mentions']['Row']
export type CompanySettings = Database['public']['Tables']['company_settings']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceItem = Database['public']['Tables']['invoice_items']['Row']
export type Quote = Database['public']['Tables']['quotes']['Row']
export type QuoteItem = Database['public']['Tables']['quote_items']['Row']
export type N1coPaymentEvent = Database['public']['Tables']['n1co_payment_events']['Row']

export type N1coMatchingStrategy = 'order_reference' | 'subscription_id' | 'email' | 'name' | 'manual' | 'orphan'

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[]
}

export interface QuoteWithItems extends Quote {
  items: QuoteItem[]
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:  'Borrador',
  issued: 'Emitida',
  paid:   'Pagada',
  void:   'Anulada',
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft:    'Borrador',
  sent:     'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired:  'Expirada',
}

export const PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  cash:     'Efectivo',
  transfer: 'Transferencia',
  check:    'Cheque',
  card:     'Tarjeta',
  other:    'Otro',
}

/** Item unificado para el dropdown de notificaciones (TopNav). */
export interface NotificationItem {
  kind: 'mention' | 'dm' | 'channel' | 'overdue' | 'calendar' | 'invoice_auto' | 'cambio_pending' | 'appointment'
  /** mention.id | conversation.id | requirement.id */
  id: string
  created_at: string
  read: boolean
  /* Para 'mention' */
  requirement_id?: string
  requirement_title?: string
  message_preview?: string
  mentioned_by?: Pick<AppUser, 'id' | 'full_name' | 'avatar_url'>
  /** Distingue mención de review (pin/asset) vs mención de chat de requirement */
  mention_source?: 'requirement' | 'review'
  /** Solo para mention_source='review' */
  review_pin_id?: string
  review_asset_name?: string
  review_version_id?: string
  client_id?: string
  /* Para 'dm' | 'channel' */
  conversation_id?: string
  conversation_name?: string | null
  conversation_type?: ConversationType
  counterpart?: Pick<AppUser, 'id' | 'full_name' | 'avatar_url'> | null
  unread_count?: number
  last_message_preview?: string | null
  /* Para 'overdue' */
  overdue_requirement_id?: string
  overdue_requirement_title?: string
  overdue_client_name?: string
  overdue_days?: number
  /* Para 'calendar' */
  calendar_entry_id?: string
  calendar_title?: string
  calendar_scheduled_at?: string
  calendar_reason?: 'assigned' | 'upcoming'
  /* Para 'invoice_auto' */
  invoice_id?: string
  invoice_number?: string
  invoice_client_name?: string
  invoice_total?: number
  invoice_currency?: string
  /* Para 'cambio_pending' */
  cambio_log_id?: string
  cambio_requirement_id?: string
  cambio_requirement_title?: string
  cambio_client_name?: string
  cambio_client_id?: string
  cambio_notes?: string
  /* Para 'appointment' (cita asignada/movida a una terapista) */
  appointment_id?: string
  appointment_subkind?: 'reposicion' | 'movida' | 'evaluacion' | 'extra' | 'nueva'
  appointment_starts_at?: string
  appointment_child_name?: string
}

/** Mensaje enriquecido con autor y adjuntos para UI */
export interface MessageWithMeta extends Message {
  author: Pick<AppUser, 'id' | 'full_name' | 'avatar_url'> | null
  attachments: MessageAttachment[]
  /** Extracto del mensaje al que responde, para mostrar la cita en UI. */
  reply_preview?: { body: string; author_name: string } | null
}

/** Item de la lista de bandeja: conversación + metadata para sidebar */
export interface ConversationListItem {
  id: string
  type: ConversationType
  name: string | null
  last_message_at: string
  unread_count: number
  /** Para DMs: el otro usuario; null para canales */
  counterpart: Pick<AppUser, 'id' | 'full_name' | 'avatar_url'> | null
  last_message_preview: string | null
}

export const ADMIN_CATEGORY_LABELS: Record<AdminCategory, string> = {
  administrativa:          'Administrativa',
  coordinacion_cuentas:    'Coordinación de Cuentas',
  reunion_interna:         'Reunión Interna',
  direccion_creativa:      'Dirección Creativa',
  direccion_comunicacion:  'Dirección de Comunicación',
  standby:                 'Tiempo de Standby',
}
export type AppUser = Database['public']['Tables']['users']['Row']

export interface ClientWithPlan extends Client {
  plan: Plan
}

export interface CycleWithRequirements extends BillingCycle {
  requirements: Requirement[]
}

/** requerimientos por tipo en un ciclo */
export type RequirementTotals = Record<ContentType, number>

/** límites efectivos = snapshot + rollover */
export type EffectiveLimits = Record<ContentType, number>

// ─────────────────────────────────────────────────────────────────────────────
// Content Review (feature de revisión estilo Frame.io / Skool)
// Migraciones 0044_content_review.sql + 0045_review_files_bucket.sql
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewAssetKind = 'image' | 'video' | 'pdf'
export type ReviewPinStatus = 'active' | 'resolved'

export interface ReviewAsset {
  id: string
  requirement_id: string
  name: string
  kind: ReviewAssetKind
  created_by: string | null
  created_at: string
  archived_at: string | null
}

export interface ReviewVersion {
  id: string
  asset_id: string
  version_number: number
  storage_path: string
  mime_type: string
  byte_size: number
  thumbnail_path: string | null
  duration_ms: number | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface ReviewPin {
  id: string
  version_id: string
  /** Archivo específico dentro de la versión al que pertenece el pin.
   *  Nullable durante migración — pines legacy quedan ligados al file_order=0. */
  file_id: string | null
  pin_number: number
  pos_x_pct: number
  pos_y_pct: number
  timestamp_ms: number | null
  page_number: number | null   // nuevo: página del PDF (0-based), null para imagen/video
  status: ReviewPinStatus
  created_by: string | null
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
}

export interface ReviewVersionFile {
  id: string
  version_id: string
  file_order: number
  storage_path: string
  thumbnail_path: string | null
  mime_type: string
  byte_size: number
  duration_ms: number | null
  created_at: string
}

export interface ReviewComment {
  id: string
  pin_id: string
  parent_id: string | null
  user_id: string | null
  body: string
  edited_at: string | null
  created_at: string
}

/** Asset con todas sus versiones ordenadas ascendentemente. */
export interface ReviewAssetWithVersions extends ReviewAsset {
  versions: ReviewVersion[]
}

/** Pin con su thread de comentarios (raíz + respuestas). */
export interface ReviewPinWithComments extends ReviewPin {
  comments: ReviewComment[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice/Video Calls (migración 0069_voice_calls.sql)
// ─────────────────────────────────────────────────────────────────────────────

export type CallSession = Database['public']['Tables']['call_sessions']['Row']
export type CallParticipant = Database['public']['Tables']['call_participants']['Row']

/** Sesión de llamada activa con metadata para la UI del dock. */
export interface ActiveCallInfo {
  sessionId: string
  conversationId: string
  roomName: string
  modality: CallModality
  /** Para mostrar en el dock: nombre del canal o nombre del otro user en DM. */
  title: string
  /** Avatar para DMs; null para canales. */
  counterpartAvatarUrl?: string | null
  /**
   * True si la llamada es en un canal/voice_channel (afecta hangup: en canales
   * solo el usuario actual sale; en DMs colgar termina para los dos).
   */
  isChannelCall: boolean
  /**
   * True si este usuario inició la llamada (afecta auto-share: solo el iniciador
   * de modality='screen' auto-publica su pantalla; los receptores se conectan
   * a recibir, no a compartir).
   */
  isInitiator: boolean
}

/** Payload del broadcast de "incoming call" en canal user:{userId}. */
export interface IncomingCallPayload {
  sessionId: string
  conversationId: string
  roomName: string
  modality: CallModality
  fromUser: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  /** Nombre del canal si la llamada es en un channel/voice_channel (ej: "general"). Null para DMs. */
  channelName: string | null
}


// =============================================================================
// Kinetic — Tipos del dominio clínico (Fase 1+)
// =============================================================================
// Tipos correspondientes a las tablas creadas en migrations-kinetic/0091+.
// Coexisten con tipos FM (Client, Plan, Requirement, etc.) — los reemplazos de
// dominio se harán gradualmente en fases siguientes.
// =============================================================================

/** Roles de Kinetic — extiende los roles FM ('admin' | 'supervisor' | 'operator' | 'client'). */
export type KineticRole =
  | 'admin'
  | 'supervisor'
  | 'operator'
  | 'client'                  // legacy: portal padres (mantenido por compat)
  | 'directora'               // Directora General — aprueba reportes
  | 'coordinadora_familias'   // captación + intake (fases 1-3 del pipeline)
  | 'coordinadora_terapias'   // gestión de horarios y reposiciones
  | 'terapista'               // terapista individual
  | 'maestra'                 // programas matutinos
  | 'recepcion'               // agenda + cobros pendientes
  | 'contable'                // facturación + contabilidad sin acceso clínico
  | 'family'                  // alias semántico de 'client' para Kinetic

export type FamilyStatus = 'active' | 'paused' | 'overdue' | 'dropped'

export type FamilyUserRole = 'owner' | 'viewer'

export type ReferralSourceType =
  | 'school'
  | 'doctor'
  | 'direct'
  | 'social_media'
  | 'walk_in'
  | 'referral_other'

/** 12 fases del pipeline de atención del paciente (ver plan v0.7 sección A). */
// IntakePhase y TreatmentStatus deprecated en mig 0124. La fuente de verdad
// ahora es children.current_phase_code → intake_phase_catalog.

export type MorningProgram = 'blue_kids' | 'learning_kids' | 'aula_educativa'

export const MORNING_PROGRAM_LABELS: Record<MorningProgram, string> = {
  blue_kids: 'BlueKids',
  learning_kids: 'LearningKids',
  aula_educativa: 'Aula Educativa',
}

export type DiagnosisCode =
  | 'autismo'
  | 'tdah'
  | 'altas_capacidades'
  | 'doble_excepcionalidad'
  | 'dificultades_aprendizaje'
  | 'trastorno_lenguaje'
  | 'trastorno_motriz'
  | 'trastorno_sensorial'
  | 'trastorno_neurodesarrollo'
  | 'otro'

export interface Family {
  id: string
  code: string | null
  primary_contact_name: string
  primary_contact_email: string | null
  primary_contact_phone: string | null
  secondary_contact_name: string | null
  secondary_contact_phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relation: string | null
  fiscal_legal_name: string | null
  fiscal_nit: string | null
  fiscal_dui: string | null
  fiscal_address: string | null
  status: FamilyStatus
  notes: string | null
  created_at: string
  created_by_user_id: string | null
  updated_at: string
}

export interface FamilyUser {
  id: string
  family_id: string
  user_id: string
  role: FamilyUserRole
  can_billing: boolean
  can_work: boolean
  created_at: string
}

export interface ReferralSource {
  id: string
  type: ReferralSourceType
  name: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  specialty: string | null
  address: string | null
  notes: string | null
  can_receive_reports: boolean
  partnership_active: boolean
  created_at: string
  updated_at: string
}

// =============================================================================
// Kinetic — Fase 2: Agenda y citas
// =============================================================================

export type EventType =
  | 'terapia'
  | 'entrevista_antecedentes'
  | 'entrevista_conocimiento'
  | 'reunion_padres'
  | 'reunion_colegio'
  | 'evaluacion'
  | 'entrega_avances'
  | 'programa_matutino'
  | 'otro'

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  terapia: 'Terapia',
  entrevista_antecedentes: 'Entrevista de antecedentes',
  entrevista_conocimiento: 'Entrevista de conocimiento',
  reunion_padres: 'Reunión con padres',
  reunion_colegio: 'Reunión con colegio',
  evaluacion: 'Evaluación',
  entrega_avances: 'Entrega de avances',
  programa_matutino: 'Programa matutino',
  otro: 'Otro',
}

export type ServiceType =
  | 'lenguaje'
  | 'motricidad_gruesa'
  | 'motricidad_fina'
  | 'sensorial'
  | 'psicologica'
  | 'ocupacional'
  | 'fisica'
  | 'lectoescritura'
  | 'funciones_ejecutivas'
  | 'conductual'
  | 'blue_kids'
  | 'learning_kids'
  | 'aula_educativa'
  | 'alim_deglu'
  | 'destreza_manual_pre_escritura'
  | 'ils_escucha'
  | 'refuerzo_academico'
  | 'concentracion_atencion'
  | 'comunicacion_regulacion'
  | 'estimulacion_juego'
  | 'otra'

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  lenguaje: 'Lenguaje',
  motricidad_gruesa: 'Motricidad gruesa',
  motricidad_fina: 'Motricidad fina',
  sensorial: 'Sensorial',
  psicologica: 'Psicológica',
  ocupacional: 'Ocupacional',
  fisica: 'Física',
  lectoescritura: 'Lectoescritura',
  funciones_ejecutivas: 'Funciones ejecutivas',
  conductual: 'Conductual',
  blue_kids: 'BlueKids',
  learning_kids: 'LearningKids',
  aula_educativa: 'Aula Educativa',
  alim_deglu: 'Alimentación y deglución',
  destreza_manual_pre_escritura: 'Destreza manual y pre-escritura',
  ils_escucha: 'iLs (Escucha Atenta)',
  refuerzo_academico: 'Refuerzo Académico (Forbrain)',
  concentracion_atencion: 'Concentración y Atención',
  comunicacion_regulacion: 'Comunicación y Regulación Emocional',
  estimulacion_juego: 'Estimulación de Juego y Lenguaje',
  otra: 'Otra',
}

/** Etiquetas cortas (máx 4 chars) para celdas estrechas (ej. calendario mensual). */
export const SERVICE_TYPE_SHORT_LABELS: Record<ServiceType, string> = {
  lenguaje: 'Leng',
  motricidad_gruesa: 'MotG',
  motricidad_fina: 'MotF',
  sensorial: 'Sens',
  psicologica: 'Psic',
  ocupacional: 'Ocup',
  fisica: 'Fís',
  lectoescritura: 'Lect',
  funciones_ejecutivas: 'FE',
  conductual: 'Cond',
  blue_kids: 'BK',
  learning_kids: 'LK',
  aula_educativa: 'AE',
  alim_deglu: 'Alim',
  destreza_manual_pre_escritura: 'Dest',
  ils_escucha: 'iLs',
  refuerzo_academico: 'Forb',
  concentracion_atencion: 'Aten',
  comunicacion_regulacion: 'CRE',
  estimulacion_juego: 'EJL',
  otra: 'Otra',
}

/**
 * Color por servicio para chips/pills en UI.
 * Devuelve clases Tailwind de fondo, texto y borde sobre cualquier estado.
 * Se usa en el calendario mini del dashboard del niño.
 */
export const SERVICE_TYPE_CHIP_CLASSES: Record<ServiceType, string> = {
  lenguaje: 'bg-sky-100 text-sky-800 border-sky-200',
  motricidad_gruesa: 'bg-orange-100 text-orange-800 border-orange-200',
  motricidad_fina: 'bg-amber-100 text-amber-800 border-amber-200',
  sensorial: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  psicologica: 'bg-violet-100 text-violet-800 border-violet-200',
  ocupacional: 'bg-teal-100 text-teal-800 border-teal-200',
  fisica: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  lectoescritura: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  funciones_ejecutivas: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  conductual: 'bg-rose-100 text-rose-800 border-rose-200',
  blue_kids: 'bg-blue-100 text-blue-800 border-blue-200',
  learning_kids: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  aula_educativa: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  alim_deglu: 'bg-lime-100 text-lime-800 border-lime-200',
  destreza_manual_pre_escritura: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ils_escucha: 'bg-purple-100 text-purple-800 border-purple-200',
  refuerzo_academico: 'bg-pink-100 text-pink-800 border-pink-200',
  concentracion_atencion: 'bg-blue-100 text-blue-800 border-blue-200',
  comunicacion_regulacion: 'bg-rose-100 text-rose-800 border-rose-200',
  estimulacion_juego: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  otra: 'bg-zinc-100 text-zinc-700 border-zinc-200',
}

export type Modality = 'presencial' | 'virtual'

export type AppointmentStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'late_cancel'
  | 'rescheduled'
  | 'replacement'
  | 'cancelled'

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  in_progress: 'En curso',
  completed: 'Completada',
  no_show: 'No se presentó',
  late_cancel: 'Cancelación tardía',
  rescheduled: 'Reagendada',
  replacement: 'Reposición',
  cancelled: 'Cancelada',
}

/** Motivo de una terapia extra (is_extra=true). Suma a la planilla de servicios profesionales. */
export type ExtraReason = 'hora_extra' | 'sabado' | 'cobertura' | 'evaluacion'

export const EXTRA_REASON_LABELS: Record<ExtraReason, string> = {
  hora_extra: 'Hora extra',
  sabado: 'Sábado',
  cobertura: 'Cobertura',
  evaluacion: 'Evaluación',
}

export interface Appointment {
  id: string
  /** Null para evaluaciones a personas nuevas no registradas (ver external_child_name). */
  child_id: string | null
  /** Nombre libre de la persona evaluada cuando no hay child_id (evaluaciones). */
  external_child_name: string | null
  /** Código de service_catalog del tipo de evaluación (para calcular el pago por cost_usd). */
  service_code: string | null
  therapist_id: string | null
  event_type: EventType
  service_type: ServiceType | null
  modality: Modality
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  parent_appointment_id: string | null
  recurrence_rule: string | null
  google_calendar_event_id: string | null
  meet_link: string | null
  notification_sent_24h: boolean
  notification_sent_1h: boolean
  notes: string | null
  /** Terapia extra (cobertura / adicional). Para mensual_fijo se paga aparte. */
  is_extra: boolean
  /** Motivo de la terapia extra (solo si is_extra=true). */
  extra_reason: ExtraReason | null
  /** Momento en que la terapista marcó la terapia finalizada (arranca timer de despacho). */
  completed_at: string | null
  /** Momento en que el niño fue despachado (recogido). */
  dispatched_at: string | null
  dispatch_type: 'internal' | 'to_reception' | 'to_parent' | null
  handed_to_reception_at: string | null
  /** Grupo de programa matutino al que pertenece esta cita (mig 0151). */
  program_group_id: string | null
  dispatched_by_user_id: string | null
  /** Minutos de espera para recogida (completed→dispatched). */
  late_fee_minutes: number | null
  /** Cargo por recogida tardía (USD). */
  late_fee_usd: number
  /** none | suggested | charged | waived. */
  late_fee_status: 'none' | 'suggested' | 'charged' | 'waived'
  late_fee_waive_reason: string | null
  /** Pop-up de despacho pospuesto hasta esta hora ("no lo han traído aún"). */
  dispatch_snoozed_until: string | null
  /** Solo se usa cuando event_type='otro'. Etiqueta libre que aparece en el calendario. */
  custom_event_label: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type InstitutionalClosureType = 'holiday' | 'closure' | 'gov_decree' | 'kinetic_break'

export const INSTITUTIONAL_CLOSURE_TYPE_LABELS: Record<InstitutionalClosureType, string> = {
  holiday: 'Asueto',
  closure: 'Cierre',
  gov_decree: 'Decreto gubernamental',
  kinetic_break: 'Receso Kinetic',
}

export interface InstitutionalClosure {
  id: string
  date: string
  type: InstitutionalClosureType
  name: string
  description: string | null
  all_day: boolean
  year_recurring: boolean
  created_at: string
  updated_at: string
}

/**
 * Horario laboral configurable de un terapista (mig 0115).
 * Cada fila es un bloque continuo (un día puede tener múltiples bloques
 * si hay pausa de almuerzo en medio).
 */
export interface TherapistWorkScheduleBlock {
  id: string
  therapist_id: string
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6  // 0=domingo, 6=sábado
  start_time: string  // "HH:MM:SS"
  end_time: string    // "HH:MM:SS"
  active: boolean
  created_at: string
  updated_at: string
}

// =============================================================================
// Lista de espera (mig 0116)
// =============================================================================

export type ReferralChannel =
  | 'redes_sociales'
  | 'medico'
  | 'amigo_familiar'
  | 'reingreso'
  | 'colegio'
  | 'otro'

export const REFERRAL_CHANNEL_LABELS: Record<ReferralChannel, string> = {
  redes_sociales: 'Redes Sociales',
  medico: 'Médico',
  amigo_familiar: 'Amigo o familiar',
  reingreso: 'Reingreso',
  colegio: 'Colegio',
  otro: 'Otro',
}

export interface WaitlistEntry {
  id: string
  child_full_name: string
  child_birthdate: string | null
  child_diagnosis: string | null
  parent_full_name: string
  parent_phone: string
  parent_email: string | null
  requested_service_type: ServiceType
  preferred_therapist_id: string | null
  preferred_days: string | null
  notes: string | null
  referral_source_id: string | null
  priority: 0 | 1 | 2
  added_by_user_id: string | null
  added_at: string
  contacted_at: string | null
  contacted_by_user_id: string | null
  dropped_at: string | null
  dropped_reason: string | null
  scheduled_child_id: string | null
  updated_at: string
  /** Pipeline 0121: sub-fase actual del catálogo intake_phase_catalog. */
  current_phase_code: string | null
  /** Mig 0122: campos del formulario de prospectos (Google Form 2022). */
  child_age_text: string | null
  has_previous_evaluation: boolean | null
  referral_channel: ReferralChannel | null
  referral_channel_other: string | null
  interest_text: string | null
}

export interface VirtualMeeting {
  id: string
  appointment_id: string | null
  context: 'therapy' | 'directora_interview' | 'parents_meeting' | 'school_meeting' | 'evaluation'
  provider: 'google_meet'
  external_event_id: string | null
  join_url: string | null
  scheduled_for: string
  ends_at: string | null
  status: 'scheduled' | 'started' | 'ended' | 'cancelled'
  created_by_user_id: string | null
  created_at: string
}

export interface Child {
  id: string
  family_id: string
  code: string | null              // auto-generado por trigger si null al insert
  full_name: string
  preferred_name: string | null
  birth_date: string | null
  gender: 'M' | 'F' | 'other' | null
  blood_type: string | null
  allergies_text: string | null
  medications_text: string | null
  preferred_hospital: string | null
  school_name: string | null
  school_grade: string | null
  diagnoses_json: DiagnosisCode[]
  diagnoses_display_text: string | null
  referral_source_type: ReferralSourceType | null
  referral_source_id: string | null
  referral_notes: string | null
  enrolled_program: MorningProgram | null
  enrollment_started_at: string | null
  enrollment_ended_at: string | null
  notes: string | null
  photo_url: string | null
  created_at: string
  created_by_user_id: string | null
  updated_at: string
  /** Pipeline 0121: sub-fase actual del catálogo intake_phase_catalog. */
  current_phase_code: string | null
  /** Mig 0124: timestamp del último cambio de fase. */
  current_phase_changed_at: string
  /** Mig 0124: notas asociadas al cambio de fase actual. */
  current_phase_notes: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// Pipeline de admisión (mig 0121) — catálogo + history + discharge + alerts
// ──────────────────────────────────────────────────────────────────────────

export type PhaseGroupNumber = 1 | 2 | 3 | 4 | 5

export interface IntakePhaseCatalogEntry {
  code: string
  group_number: PhaseGroupNumber
  group_name: string
  sub_order: number
  label: string
  description: string | null
  is_optional: boolean
  is_waitlist_visible: boolean
  is_terminal: boolean
  creates_child: boolean
  cancels_future_appointments: boolean
  active: boolean
  sort_order: number
  created_at: string
}

export const PHASE_GROUP_LABELS: Record<PhaseGroupNumber, string> = {
  1: 'Primer contacto',
  2: 'Proceso de Admisión',
  3: 'Inicio Terapéutico',
  4: 'Seguimiento',
  5: 'Cierre',
}

/** Paleta por grupo para chips, stepper y banners. */
export const PHASE_GROUP_COLORS: Record<
  PhaseGroupNumber,
  { bg: string; text: string; ring: string }
> = {
  1: { bg: 'bg-purple-500/15', text: 'text-purple-700', ring: 'ring-purple-500/30' },
  2: { bg: 'bg-blue-500/15',   text: 'text-blue-700',   ring: 'ring-blue-500/30'   },
  3: { bg: 'bg-emerald-500/15', text: 'text-emerald-700', ring: 'ring-emerald-500/30' },
  4: { bg: 'bg-amber-500/15',  text: 'text-amber-800',  ring: 'ring-amber-500/30'  },
  5: { bg: 'bg-slate-500/15',  text: 'text-slate-700',  ring: 'ring-slate-500/30'  },
}

export interface ChildPhaseHistoryEntry {
  id: string
  child_id: string | null
  waitlist_entry_id: string | null
  from_phase_code: string | null
  to_phase_code: string
  notes: string | null
  changed_by_user_id: string | null
  changed_at: string
}

export type DischargeType = 'alta' | 'retiro'
export type DischargeStatus = 'draft' | 'signed' | 'sent_to_family'

export const DISCHARGE_TYPE_LABELS: Record<DischargeType, string> = {
  alta: 'Alta Terapéutica',
  retiro: 'Retirado',
}

export interface DischargeChildSnapshot {
  full_name: string
  preferred_name: string | null
  birth_date: string | null
  gender: 'M' | 'F' | 'other' | null
  enrollment_started_at: string | null
  diagnoses_display_text: string | null
}

export interface DischargeTherapySnapshot {
  service_type: string
  label: string
  started_at: string | null
  ended_at: string | null
  total_sessions: number | null
}

export interface ChildDischargeRecord {
  id: string
  child_id: string
  discharge_type: DischargeType
  discharge_date: string
  child_snapshot_json: DischargeChildSnapshot
  therapies_snapshot_json: DischargeTherapySnapshot[]
  total_sessions_attended: number | null
  attendance_rate_pct: number | null
  total_replacements: number | null
  objectives_achieved: string | null
  recommendations: string | null
  follow_up_plan: string | null
  discharge_reason: string | null
  signed_by_therapist_id: string | null
  signed_by_therapist_name: string | null
  signed_by_therapist_at: string | null
  signed_by_directora_id: string | null
  signed_by_directora_name: string | null
  signed_by_directora_at: string | null
  status: DischargeStatus
  pdf_generated_at: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type DashboardAlertType = 'discharge' | 'dropout' | 'phase_milestone'

export interface DashboardAlert {
  id: string
  alert_type: DashboardAlertType
  child_id: string | null
  message: string
  visible_to_roles: string[]
  expires_at: string
  created_at: string
  created_by_user_id: string | null
}

// ── Fase 3-A+D ────────────────────────────────────────────────────────────────

export interface TherapySession {
  id: string
  appointment_id: string
  therapist_id: string | null
  child_id: string
  started_at: string
  ended_at: string | null
  status: 'active' | 'completed'
  created_at: string
}

export type JournalCategory = 'home_exercise' | 'observation' | 'question' | 'response'

export interface ChildJournalEntry {
  id: string
  child_id: string
  author_user_id: string | null
  category: JournalCategory
  body: string
  attachments_json: unknown[]
  visible_to_family: boolean
  linked_appointment_id: string | null
  created_at: string
  updated_at: string
}

export type SessionReportStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'sent_to_family'

export interface SessionReport {
  id: string
  session_id: string
  appointment_id: string
  child_id: string
  therapist_id: string | null
  actividades: string
  respuesta_del_nino: string
  tarea_para_casa: string
  observaciones_internas: string
  visible_to_family: boolean
  status: SessionReportStatus
  submitted_at: string | null
  approved_by_user_id: string | null
  approved_at: string | null
  rejected_by_user_id: string | null
  rejected_at: string | null
  rejection_reason: string | null
  sent_to_family_at: string | null
  /** Origen del reporte (mig 0108): 'editor' (campos de texto) o 'file' (archivo subido). */
  upload_kind: 'editor' | 'file'
  /** Path en bucket reports-files. Solo set si upload_kind='file'. */
  file_url: string | null
  file_name: string | null
  file_size_bytes: number | null
  file_mime_type: string | null
  created_at: string
  updated_at: string
}

export type ProgressReportStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'sent_to_family'

/** Valor de un bloque dentro de progress_reports.data_json (post-C2).
 *  Forma depende del `block.kind` del template:
 *    - rich_text                  → string
 *    - numbered_list              → string[]
 *    - categorized_text           → Record<categoryKey, string>
 *    - recommendations_by_area    → Record<areaKey, string>
 *  Stage 5 de C2 hará que el editor/aprobaciones/portal usen este tipo. */
export type ProgressReportDataValue = string | string[] | Record<string, string>

/** Forma flexible para informes creados desde un template DB-driven (post-Stage-5). */
export type ProgressReportDataFlexible = Record<string, ProgressReportDataValue>

/** Forma legacy v0.7 (Fase 3-C1) — keys conocidos, todo string. Mantenido para
 *  compat hasta que Stage 5 migre los consumidores. */
export interface ProgressReportData {
  seguimiento?: string
  dificultades_ingreso?: string
  objetivos_terapeuticos?: string
  actividades_ejercicios?: string
  logros_obtenidos?: string
  orientaciones_casa?: string
  recomendaciones?: string
}

export interface ProgressReport {
  id: string
  child_id: string
  service_type: string
  period_starts: string
  period_ends: string
  authored_by_user_id: string | null
  sessions_attended_count: number
  data_json: ProgressReportData
  status: ProgressReportStatus
  visible_to_family: boolean
  submitted_at: string | null
  approved_by_user_id: string | null
  approved_at: string | null
  rejected_by_user_id: string | null
  rejected_at: string | null
  rejection_reason: string | null
  sent_to_family_at: string | null
  /** FK al template usado. Null = reporte legacy pre-C2 (mig 0098). */
  template_id: string | null
  /** Origen del informe (mig 0108): 'editor' (data_json) o 'file' (archivo subido). */
  upload_kind: 'editor' | 'file'
  /** Path en bucket reports-files. Solo set si upload_kind='file'. */
  file_url: string | null
  file_name: string | null
  file_size_bytes: number | null
  file_mime_type: string | null
  /** Notas del terapeuta visibles para la familia (mig 0114). */
  family_notes: string | null
  created_at: string
  updated_at: string
}

// =============================================================================
// Kinetic — Fase 3-C2: Plantillas de informes (report_templates, mig 0098)
// =============================================================================

export type ReportTemplateKind =
  | 'progress'
  | 'session'
  | 'evaluation'
  | 'morning_program_quarterly'

export type ReportTemplateBlockKind =
  | 'rich_text'
  | 'numbered_list'
  | 'categorized_text'
  | 'recommendations_by_area'

export interface ReportTemplateBlockArea {
  key: string
  label: string
}

export interface ReportTemplateBlock {
  /** Único dentro de blocks_json — sirve como key de data_json en el reporte. */
  key: string
  label: string
  description?: string
  required: boolean
  kind: ReportTemplateBlockKind
  placeholder?: string
  /** Solo aplica si kind === 'recommendations_by_area' o 'categorized_text'. */
  areas?: ReportTemplateBlockArea[]
}

export interface ReportTemplate {
  id: string
  name: string
  kind: ReportTemplateKind
  /** Null = aplica a cualquier terapia. */
  service_type: string | null
  blocks_json: ReportTemplateBlock[]
  default_signers_role: string | null
  active: boolean
  version: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// =============================================================================
// Kinetic — Ronda 1: Treatment plans + appointment absences (mig 0100)
// =============================================================================

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

/** Modalidad de cobro de una entrada del plan.
 *    per_session  — sesiones × precio unitario (terapias individuales).
 *    monthly_flat — mensualidad fija de suscripción (programas matutinos):
 *                   se generan citas todos los días establecidos del mes sin
 *                   cuota, y se cobra 1 × precio sin importar 28 o 31 días.
 *  Ausente ⇒ los servicios matutinos (blue_kids/learning_kids/aula_educativa)
 *  son monthly_flat implícito; el resto per_session (ver
 *  src/lib/domain/billing/monthly-flat.ts). */
export type TherapyBillingMode = 'per_session' | 'monthly_flat'

/** Una terapia activa en el plan del niño. */
export interface TreatmentPlanTherapyEntry {
  service: ServiceType
  active: boolean
  /** Cantidad de sesiones por mes contratadas (cuadro "Cantidad de Terapias al mes" del Excel).
   *  En modalidad monthly_flat se ignora para el cobro. */
  sessions_per_month: number
  /** per_session: costo por sesión. monthly_flat: mensualidad fija. USD. */
  unit_cost_usd: number
  /**
   * Terapista asignada a ESTE tipo de terapia — fuente única de la asignación
   * (ya no hay "terapista principal"). Requerida para terapias no matutinas;
   * los programas matutinos los cubre el grupo (queda null). Al generar el ciclo,
   * cada cita del servicio se asigna a esta terapista. Habilita al niño/a en
   * "mis niños" de esa persona.
   */
  therapist_id?: string | null
  /** Modalidad de cobro. Ver TherapyBillingMode. */
  billing_mode?: TherapyBillingMode
  /** Variante del programa matutino (días a la semana, del catálogo de
   *  mensualidades). Solo aplica en monthly_flat. */
  days_per_week?: number | null
}

/** Frecuencia de un slot dentro del mes.
 *    weekly   — todos los matches del mes (default)
 *    biweekly — cada 14 días desde el primer match del mes
 *    monthly  — solo el primer match del mes
 */
export type SlotFrequency = 'weekly' | 'biweekly' | 'monthly'

export const SLOT_FREQUENCY_LABELS: Record<SlotFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
}

/** Slot recurrente del horario semanal. */
export interface TreatmentPlanScheduleSlot {
  day_of_week: DayOfWeek
  /** 'HH:MM' (24h) en zona América/El_Salvador. */
  time_local: string
  /** Duración en minutos (típicamente 30 o 60). */
  duration_minutes: number
  service: ServiceType
  /** Default 'weekly' si no está. */
  frequency?: SlotFrequency
}

export type DiscountKind = 'none' | 'percent' | 'fixed'

export const DISCOUNT_KIND_LABELS: Record<DiscountKind, string> = {
  none: 'Sin descuento',
  percent: 'Porcentaje',
  fixed: 'Monto fijo',
}

export interface TreatmentPlan {
  id: string
  child_id: string
  primary_therapist_id: string | null
  diagnosis_text: string | null
  /** Fecha (YYYY-MM-DD) de inicio del plan. */
  starts_at: string | null
  /** Edad capturada como string (ej. "2a, 9m"). */
  age_at_start_text: string | null
  therapies_json: TreatmentPlanTherapyEntry[]
  schedule_pattern_json: TreatmentPlanScheduleSlot[]
  observations: string | null
  monthly_total_usd: number | null
  signed_at: string | null
  signed_by_user_id: string | null
  active: boolean
  /** Descuento aplicado al subtotal mensual (mig 0109). */
  discount_kind: DiscountKind
  /** Si kind=percent: 0-100. Si kind=fixed: USD. */
  discount_value: number
  discount_reason: string | null
  created_at: string
  created_by_user_id: string | null
  updated_at: string
  updated_by_user_id: string | null
}

export type TreatmentPlanChangeKind = 'create' | 'update' | 'deactivate'

export interface TreatmentPlanChange {
  id: string
  treatment_plan_id: string
  changed_at: string
  changed_by_user_id: string | null
  before_json: Partial<TreatmentPlan>
  after_json: Partial<TreatmentPlan>
  kind: TreatmentPlanChangeKind
  notes: string | null
}

export type AppointmentAbsenceStatus = 'pending' | 'replaced' | 'waived'

export const ABSENCE_STATUS_LABELS: Record<AppointmentAbsenceStatus, string> = {
  pending: 'Pendiente de reagendar',
  replaced: 'Reagendada',
  waived: 'No se repone',
}

export interface AppointmentAbsence {
  id: string
  appointment_id: string
  child_id: string
  therapist_id: string | null
  reported_by_user_id: string | null
  reported_at: string
  reason: string | null
  status: AppointmentAbsenceStatus
  resolved_at: string | null
  resolved_by_user_id: string | null
  replacement_appointment_id: string | null
  waive_reason: string | null
  created_at: string
}

// =============================================================================
// Kinetic — Ronda 2: Monthly session cycles + billing (mig 0101)
// =============================================================================

export type MonthlySessionCycleStatus =
  | 'paid_pending_generation'
  | 'generated'
  | 'cancelled'

export const MONTHLY_CYCLE_STATUS_LABELS: Record<MonthlySessionCycleStatus, string> = {
  paid_pending_generation: 'Pago registrado',
  generated: 'Generado',
  cancelled: 'Anulado',
}

export interface MonthlySessionCycle {
  id: string
  child_id: string
  /** Primer día del mes en SV (date 'YYYY-MM-01'). */
  period_month: string
  treatment_plan_snapshot: TreatmentPlan | Record<string, unknown>
  /** Fecha de pago REAL. null = pendiente de pago (factura emitida). */
  paid_at: string | null
  paid_by_user_id: string | null
  payment_method: string | null
  payment_reference: string | null
  payment_amount_usd: number
  invoice_id: string | null
  appointments_generated_at: string | null
  appointments_generated_count: number
  status: MonthlySessionCycleStatus
  /** Estado de pago: 'pending' (factura emitida sin pagar) | 'paid'. */
  payment_status: 'pending' | 'paid'
  /** Fecha límite de pago (periodo de gracia). Default día 5 del mes. */
  due_date: string | null
  /** Prórroga manual del vencimiento (recargo se mide contra esta fecha). */
  grace_extended_to: string | null
  grace_extension_reason: string | null
  /** Recargo por mora aplicado al pagar (USD). */
  surcharge_amount_usd: number
  /** Rollover de sesiones no dadas del mes anterior. */
  rollover_mode: 'none' | 'accumulate' | 'discount'
  rollover_sessions_json: Record<string, number> | null
  rollover_discount_usd: number
  rollover_from_period: string | null
  cancel_reason: string | null
  cancelled_at: string | null
  cancelled_by_user_id: string | null
  notes: string | null
  /** Descuento aplicado al ciclo (mig 0109). Snapshot del plan al momento de pago, editable. */
  discount_kind: DiscountKind
  discount_value: number
  discount_reason: string | null
  /** Programa matutino: grupo al que quedó asignado el niño ese mes (mig 0148/0149). */
  program_group_id: string | null
  /** Días de asistencia del niño en el grupo ese mes (snapshot). */
  attendance_days: string[] | null
  created_at: string
  updated_at: string
}

// ── Programas matutinos por grupo (mig 0148/0149) ───────────────────────────

/** Código de día de la semana (igual que schedule_pattern_json.day_of_week). */
export type WeekdayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type ProgramGroupSessionStatus = 'scheduled' | 'held' | 'cancelled'
export type ProgramAttendanceStatus = 'present' | 'absent' | 'excused'

/** Grupo permanente de un programa matutino (BlueKids/LearningKids/Aula). */
export interface ProgramGroup {
  id: string
  program: MorningProgram
  name: string
  active: boolean
  /** Días que se reúne el grupo (ej. ['mon','tue','wed','thu','fri']). */
  meeting_days: string[]
  /** Hora de inicio en SV, 'HH:MM'. */
  start_time_local: string
  duration_minutes: number
  created_at: string
  updated_at: string
}

/** Maestra/terapista del grupo (varias filas = grupo compartido). */
export interface ProgramGroupStaff {
  group_id: string
  user_id: string
  is_lead: boolean
  created_at: string
}

/** Niño miembro de un grupo + sus días de asistencia. */
export interface ProgramGroupMember {
  id: string
  group_id: string
  child_id: string
  /** Subconjunto de los días del grupo (ej. ['mon','wed','fri']). */
  attendance_days: string[]
  active: boolean
  created_at: string
  updated_at: string
}

/** Cada reunión del grupo (una por día). */
export interface ProgramGroupSession {
  id: string
  group_id: string
  /** Fecha de la sesión 'YYYY-MM-DD'. */
  session_date: string
  starts_at: string
  ends_at: string
  status: ProgramGroupSessionStatus
  created_at: string
  updated_at: string
}

/** Asistencia de un niño a una sesión de grupo (la lista pasada). */
export interface ProgramSessionAttendance {
  id: string
  session_id: string
  child_id: string
  status: ProgramAttendanceStatus
  marked_by_user_id: string | null
  marked_at: string
  note: string | null
}

/** Output del RPC `compute_monthly_appointment_candidates`. */
export interface MonthlyCandidateAppointment {
  service: ServiceType | string
  starts_at: string
  ends_at: string
  duration_minutes: number
}

export interface MonthlyConflict {
  candidate: MonthlyCandidateAppointment
  conflicting_appointment_id: string
  conflict_starts_at: string
  conflict_child_id: string
}

export interface MonthlyCandidatesResult {
  candidates: MonthlyCandidateAppointment[]
  skipped_holidays: MonthlyCandidateAppointment[]
  /** Citas que el patrón generaba pero exceden la cuota mensual del servicio. */
  skipped_overquota: MonthlyCandidateAppointment[]
  conflicts: MonthlyConflict[]
  summary: {
    candidate_count: number
    conflict_count: number
    skipped_holiday_count: number
    skipped_overquota_count: number
  }
  plan: {
    id: string
    primary_therapist_id: string | null
    monthly_total_usd: number | null
  }
}

// =============================================================================
// Kinetic — Catálogo de servicios y tarifas (mig 0107)
// =============================================================================

export type ServiceCategory =
  | 'matricula'
  | 'mensualidad'
  | 'material_didactico'
  | 'uniforme'
  | 'entrevista'
  | 'asesoria'
  | 'evaluacion'
  | 'evaluacion_dx_tea'
  | 'evaluacion_psicologica'
  | 'terapia_individual'

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  matricula: 'Matrícula',
  mensualidad: 'Mensualidad',
  material_didactico: 'Material didáctico',
  uniforme: 'Uniformes',
  entrevista: 'Entrevistas',
  asesoria: 'Asesoría',
  evaluacion: 'Evaluaciones',
  evaluacion_dx_tea: 'Evaluaciones DX TEA',
  evaluacion_psicologica: 'Evaluaciones psicológicas',
  terapia_individual: 'Terapia individual',
}

/** Orden estable para mostrar las categorías en UI. */
export const SERVICE_CATEGORY_ORDER: ServiceCategory[] = [
  'terapia_individual',
  'matricula',
  'mensualidad',
  'material_didactico',
  'uniforme',
  'entrevista',
  'asesoria',
  'evaluacion',
  'evaluacion_dx_tea',
  'evaluacion_psicologica',
]

export interface ServiceCatalogItem {
  id: string
  code: string
  category: ServiceCategory
  name: string
  description: string | null
  unit_price_usd: number
  /**
   * Precio descontado para niños en programa matutino (BK / Learning Kids / Aula).
   * NULL = no aplica descuento.
   */
  unit_price_bk_usd: number | null
  /**
   * Costo interno por sesión/terapia (lo que se le paga a la terapista).
   * Alimenta la planilla 'por_terapias' y las terapias extra. NULL = sin costo.
   */
  cost_usd: number | null
  duration_minutes: number | null
  morning_program: MorningProgram | null
  days_per_week: number | null
  /**
   * Enlace con el enum ServiceType para que el TreatmentPlanEditor pueda
   * jalar el precio automáticamente cuando el usuario elige el tipo de terapia.
   */
  service_type: ServiceType | null
  proration_group: string | null
  applies_from_month: number | null
  applies_to_month: number | null
  active: boolean
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

// =============================================================================
// Kinetic — Fase 8: Planillas (mig 0117)
// =============================================================================

export type PayrollContractType = 'mensual_fijo' | 'por_terapias' | 'sin_contrato'

export const CONTRACT_TYPE_LABELS: Record<PayrollContractType, string> = {
  mensual_fijo: 'Mensual fijo',
  por_terapias: 'Por terapias',
  sin_contrato: 'Sin contrato (no entra en planilla)',
}

export type AfpProvider = 'crecer' | 'confia'

export const AFP_PROVIDER_LABELS: Record<AfpProvider, string> = {
  crecer: 'Crecer',
  confia: 'Confía',
}

export type PayrollRunStatus = 'draft' | 'sealed' | 'paid' | 'cancelled'

export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft: 'Borrador',
  sealed: 'Sellada',
  paid: 'Pagada',
  cancelled: 'Anulada',
}

/**
 * Régimen de la planilla:
 *  - normal: sueldo fijo, deducciones completas (ISSS/AFP/ISR) + aportes patronales.
 *  - servicios_profesionales: honorarios, solo retención ISR (10% configurable).
 */
export type PayrollType = 'normal' | 'servicios_profesionales'

export const PAYROLL_TYPE_LABELS: Record<PayrollType, string> = {
  normal: 'Normal',
  servicios_profesionales: 'Servicios profesionales',
}

/** Tramo del ISR mensual asalariados El Salvador. */
export interface IsrBracket {
  /** Mínimo del tramo en USD (inclusive). */
  from: number
  /** Máximo del tramo en USD (inclusive) o null si es el último tramo. */
  to: number | null
  /** Tasa marginal (e.g., 0.10 = 10%). */
  rate: number
  /** Cuota fija a sumar después de aplicar la tasa al excedente. */
  fixed: number
  /** Monto a restar de la base antes de aplicar la tasa (límite inferior del tramo). */
  baseSubtract: number
}

export interface PayrollFiscalConfig {
  id: string
  effective_from: string             // YYYY-MM-DD
  isss_employee_rate: number
  isss_employer_rate: number
  isss_cap_salary_usd: number
  afp_employee_rate: number
  afp_employer_rate: number
  afp_cap_salary_usd: number | null
  isr_brackets_json: IsrBracket[]
  /** Retención de renta para planilla de servicios profesionales (0.10 = 10%). */
  professional_services_isr_rate: number
  notes: string | null
  created_at: string
  created_by_user_id: string | null
}

export interface PayrollRun {
  id: string
  period_year: number
  period_month: number
  payroll_type: PayrollType
  status: PayrollRunStatus
  fiscal_config_snapshot_json: PayrollFiscalConfig | Record<string, unknown> | null
  notes: string | null
  created_at: string
  created_by_user_id: string | null
  sealed_at: string | null
  sealed_by_user_id: string | null
  paid_at: string | null
  paid_by_user_id: string | null
  cancelled_at: string | null
  cancelled_by_user_id: string | null
  cancel_reason: string | null
  updated_at: string
}

/** Snapshot del empleado al momento de sellar la planilla. */
export interface PayrollItemUserSnapshot {
  full_name: string
  email: string
  role: UserRole
  contract_type: PayrollContractType
  dui: string | null
  isss_number: string | null
  afp_number: string | null
  afp_provider: AfpProvider | null
  hire_date: string | null
}

// =============================================================================
// Kinetic — Fase 8b: Gastos generales (egresos no-planilla, mig 0118)
// =============================================================================

export type ExpenseCategory =
  | 'renta'
  | 'servicios_publicos'
  | 'transporte'
  | 'sistema_software'
  | 'material_didactico'
  | 'mantenimiento'
  | 'marketing'
  | 'comunicacion'
  | 'profesional'
  | 'impuestos'
  | 'otros'

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  renta: 'Renta del local',
  servicios_publicos: 'Servicios públicos',
  transporte: 'Transporte',
  sistema_software: 'Sistema / software',
  material_didactico: 'Material didáctico',
  mantenimiento: 'Mantenimiento',
  marketing: 'Marketing',
  comunicacion: 'Comunicación',
  profesional: 'Servicios profesionales',
  impuestos: 'Impuestos',
  otros: 'Otros',
}

export const EXPENSE_CATEGORY_ORDER: ExpenseCategory[] = [
  'renta',
  'servicios_publicos',
  'transporte',
  'sistema_software',
  'material_didactico',
  'mantenimiento',
  'marketing',
  'comunicacion',
  'profesional',
  'impuestos',
  'otros',
]

export interface GeneralExpense {
  id: string
  category: ExpenseCategory
  subcategory: string | null
  description: string | null
  amount_usd: number
  expense_date: string             // YYYY-MM-DD
  payment_method: string | null
  provider: string | null
  invoice_reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by_user_id: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// Child attachments (mig 0119) — adjuntos unificados cross-entity
// ──────────────────────────────────────────────────────────────────────────

export type ChildAttachmentKind =
  | 'tarea'
  | 'evaluacion'
  | 'imagen'
  | 'informe_adicional'
  | 'otro'

export const CHILD_ATTACHMENT_KIND_LABELS: Record<ChildAttachmentKind, string> = {
  tarea: 'Tarea',
  evaluacion: 'Evaluación',
  imagen: 'Imagen',
  informe_adicional: 'Informe adicional',
  otro: 'Otro',
}

export interface ChildAttachment {
  id: string
  child_id: string
  appointment_id: string | null
  session_report_id: string | null
  progress_report_id: string | null

  file_url: string                  // path en bucket reports-files
  file_name: string
  file_size_bytes: number | null
  file_mime_type: string | null

  title: string | null
  description: string | null
  kind: ChildAttachmentKind

  visible_to_family: boolean
  uploaded_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface PayrollItem {
  id: string
  payroll_run_id: string
  user_id: string
  user_snapshot_json: PayrollItemUserSnapshot | null

  base_salary_usd: number
  extra_hours: number
  extra_hours_rate_usd: number | null
  extra_hours_amount_usd: number
  bonus_usd: number
  other_deductions_usd: number

  gross_total_usd: number
  isss_employee_usd: number
  afp_employee_usd: number
  isr_usd: number
  total_deductions_usd: number
  net_pay_usd: number

  isss_employer_usd: number
  afp_employer_usd: number
  employer_cost_usd: number

  hours_worked_from_appointments: number | null
  hours_worked_from_sessions: number | null

  notes: string | null

  signed_at: string | null
  signed_ip: string | null

  created_at: string
  updated_at: string
}
