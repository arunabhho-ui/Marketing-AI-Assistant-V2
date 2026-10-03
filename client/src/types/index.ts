export type LeadType = 'B2B' | 'B2C'

export type AudienceType = 'B2B' | 'B2C' | 'both'

export interface StructuredProfile {
  audience_type: AudienceType
  category: string
  geography: string
  target_company_size: string
  target_consumer_segment: string
  keywords: string[]
  budget_scale_signal: string
  summary: string
}

export interface Lead {
  id: string
  name: string
  type: LeadType
  isSingleCompany?: boolean
  title?: string
  company?: string
  companyName?: string | null
  placeType?: string
  location: string
  address?: string
  fitScore: number
  reason: string
  contactUrl?: string
  website?: string
  officialWebsite?: string | null
  websiteVerification?: string | null
  sourceDomain?: string
  phone?: string
  email?: string
  emailSource?: string | null
  phoneSource?: string | null
  contactSource?: string | null
  contactConfidence?: string | null
  contactStatus?: string
  employeeCount?: string
  industry?: string
  tags: string[]
  rawData?: Record<string, unknown>
}

export type ViewState = 'landing' | 'confirm-profile' | 'loading' | 'results' | 'empty'
export type FilterType = 'all' | 'B2B' | 'B2C'
