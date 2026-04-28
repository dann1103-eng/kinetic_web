/**
 * Tipos del cliente HTTP n1co.
 * Basados en docs.n1co.com (Integration API V3) tras revisión 2026-04-27.
 */

export interface N1coTokenResponse {
  tokenType: 'Bearer'
  accessToken: string
  /** Segundos hasta expiración (típicamente ~3598). */
  expiresIn: number
}

// ── CheckoutLink (links dinámicos por factura) ───────────────

export interface N1coMetadataItem {
  name: string
  value: string
}

export interface N1coLineItem {
  /** Si se pasa SKU, n1co usa el producto pre-registrado. Si se pasa product, lo crea ad-hoc. */
  sku?: string
  product?: {
    name: string
    price: number
    imageUrl?: string
    requiresShipping?: boolean
  }
  quantity: number
}

export interface CreatePaymentLinkInput {
  /** Identificador externo (ej. invoice.id). El webhook lo retornará. */
  orderReference?: string
  orderName?: string
  orderDescription?: string
  /** Monto fijo. Mutuamente exclusivo con lineItems. */
  amount?: number
  lineItems?: N1coLineItem[]
  successUrl?: string
  cancelUrl?: string
  /** Default 1440 (24h). */
  expirationMinutes?: number
  locationCode?: string
  metadata?: N1coMetadataItem[]
}

export interface CreatePaymentLinkResponse {
  orderCode: string
  orderId: number
  paymentLinkUrl: string
}

// ── Plans (suscripciones) ────────────────────────────────────

export type N1coBillingCycleType = 'Day' | 'Week' | 'Month' | 'Year'

export interface CreatePlanInput {
  name: string
  description: string
  amount: number
  billingCycleType: N1coBillingCycleType
  billingCyclesNumber: number
  /** Día específico del mes (1-27 o 31). Solo válido para ciclos mensuales. */
  billingDay?: number | null
  cyclesToBillBeforeAllowCancelation?: number | null
  termsAndConditions?: string
  subscriberLimit?: number | null
  enrollmentEndDate?: string | null
  subscriptionEndDate?: string | null
  /** locationId obtenido del comercio en n1co. */
  locationId: number
  customFields?: Array<{
    label: string
    name: string
    placeholder?: string
    isRequired?: boolean
    isVisible?: boolean
    isEditable?: boolean
    defaultValue?: string
  }>
}

export interface N1coPlan {
  planId: number
  name: string
  description: string
  amount: number
  billingCycleType: N1coBillingCycleType
  billingCyclesNumber: number
  active?: boolean
}

// ── Subscriptions ────────────────────────────────────────────

export interface N1coCustomerInput {
  /** ID externo del cliente — usar client.id del CRM aquí para matching. */
  id?: string
  name: string
  email: string
  phoneNumber?: string
}

export interface CreateSubscriptionInput {
  planId: number
  customer: N1coCustomerInput
  paymentMethod: { id: string }
  backupPaymentMethod?: { id: string }
  authenticationId?: string | null
  billingInfo?: {
    countryCode?: string
    stateCode?: string
    zipCode?: string
  }
  locationCode?: string
}

export type N1coSubscriptionApiStatus =
  | 'Activa' | 'Bloqueada' | 'Inactiva' | 'Pendiente' | 'Error'

export type N1coOperationStatus =
  | 'SUCCEEDED'
  | 'AUTHENTICATION_REQUIRED'
  | 'FAILED'
  | 'ERROR'

export interface N1coSubscriptionData {
  subscriptionId: number
  planId: number
  name: string
  description: string
  amount: number
  amountFormatted: string
  billingCycle: number
  billingCycleType: string
  currencyCode: string
  locale: string
  currentPeriodStart: string
  currentPeriodEnd: string
  timezone: string
  subscriptionStatus: N1coSubscriptionApiStatus
  customer: {
    name: string
    email: string
    phone: string
    paymentMethodName?: string
    paymentMethodCardBrand?: string
    paymentMethodBin?: string
    paymentMethodLastDigits?: string
    backupPaymentMethodName?: string
    backupPaymentMethodCardBrand?: string
    backupPaymentMethodBin?: string
    backupPaymentMethodLastDigits?: string
  }
}

export interface CreateSubscriptionResponse {
  status: N1coOperationStatus
  message: string
  error: string | null
  authentication: {
    url: string
    id: string
  } | null
  subscription: N1coSubscriptionData | null
  payment: {
    chargeId: string
    authorizationCode: string
  } | null
}

// ── PaymentMethods ───────────────────────────────────────────

export interface CreatePaymentMethodInput {
  customer: N1coCustomerInput
  card: {
    number: string
    cardHolder: string
    expirationMonth: string
    expirationYear: string
    cvv: string
    /** false → guardar para uso futuro (suscripciones); true → un solo uso. */
    singleUse?: boolean
  }
}

export interface CreatePaymentMethodResponse {
  id: string
  type: 'card'
  bin: {
    brand: string
    issuerName: string
    countryCode: string
  }
  success: boolean
  message: string
}

// ── Charges (cargo directo) ──────────────────────────────────

export interface CreateChargeInput {
  customer: N1coCustomerInput
  order: {
    id: string
    amount: number
    description: string
    name: string
  }
  cardId: string
  authenticationId?: string | null
  billingInfo?: {
    countryCode?: string
    stateCode?: string
    zipCode?: string
  }
  locationCode?: string
}

export interface CreateChargeResponse {
  status: N1coOperationStatus
  message: string
  authentication?: {
    url: string
    id: string
  }
  order?: {
    id: string
    reference: string
    amount: number
    authorizationCode: string
  }
}

// ── Webhooks (payload) ───────────────────────────────────────

export type N1coWebhookEventType =
  | 'Created'
  | 'SuccessPayment'
  | 'PaymentError'
  | 'Cancelled'
  | 'Finalized'
  | 'Updated'
  | 'Deleted'
  | 'SuccessReverse'
  | 'ReverseError'
  | 'ThreeDSecureAuthSucceeded'
  | 'ThreeDSecureAuthError'
  | 'ThreeDSecureAuthExpired'
  | 'ThreeDSecureAuthFailed'
  | 'SubscriptionConfirmation'
  | 'SubscriptionPayment'
  | 'SubscriptionCancelled'

/**
 * Payload genérico de webhook. La forma exacta depende del tipo:
 * - SuccessPayment: tiene orderId/orderReference top-level + metadata rica
 * - Subscription*: tiene subscriptionId top-level + metadata con OrderId/OrderReference
 */
export interface N1coWebhookPayload {
  type: N1coWebhookEventType
  level?: string
  description?: string
  // SuccessPayment fields
  orderId?: string
  orderReference?: string
  // Subscription fields
  subscriptionId?: string
  // Metadata: bag of strings con detalles del evento
  metadata?: Record<string, unknown>
}

// ── Errores tipados ──────────────────────────────────────────

export class N1coApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `n1co API error (${status})`)
    this.name = 'N1coApiError'
    this.status = status
    this.body = body
  }
}
