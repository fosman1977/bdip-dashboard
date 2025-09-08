export type Barrister = {
  id: string
  name: string
  email: string
  year_of_call: number | null
  practice_areas: string[]
  seniority: 'Pupil' | 'Junior' | 'Middle' | 'Senior' | 'KC'
  is_active: boolean
  engagement_score: number
  current_workload?: number
  created_at: string
  updated_at: string
}

export type Clerk = {
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

export type Client = {
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

export type Enquiry = {
  id: string
  lex_reference: string | null
  client_id: string | null
  client?: Client
  source: 'Email' | 'Phone' | 'Website' | 'Referral' | 'Direct'
  practice_area: string | null
  matter_type: string | null
  description: string | null
  estimated_value: number | null
  urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
  status: 'New' | 'Assigned' | 'In Progress' | 'Converted' | 'Lost'
  assigned_clerk_id: string | null
  assigned_clerk?: Clerk
  assigned_barrister_id: string | null
  assigned_barrister?: Barrister
  received_at: string
  responded_at: string | null
  converted_at: string | null
  response_time_hours: number | null
  conversion_probability: number | null
  created_at: string
  updated_at: string
}

export type Task = {
  id: string
  enquiry_id: string | null
  enquiry?: Enquiry
  barrister_id: string | null
  barrister?: Barrister
  clerk_id: string | null
  clerk?: Clerk
  type: 'Call' | 'Email' | 'Research' | 'Meeting' | 'Proposal' | 'Follow-up'
  description: string | null
  due_date: string | null
  completed_at: string | null
  points: number
  created_at: string
  updated_at: string
}

export type CSVImport = {
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

// Algorithm Types
export interface EngagementMetrics {
  responseTime: number      // Hours to respond (weight: 30%)
  conversionRate: number    // Win rate (weight: 40%)
  clientSatisfaction: number // 1-5 rating (weight: 20%)
  revenueGenerated: number  // Total £ (weight: 10%)
}

export interface RoutingCriteria {
  practiceArea: string
  complexity: 'Simple' | 'Medium' | 'Complex'
  value: number
  urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
}

// CSV Types
export interface LEXImportRow {
  Client: string
  'Matter Description': string
  'Fee Earner': string
  'Date Received': string
  Value: string
  Status: string
  Reference: string
}

export interface LEXExportRow {
  Reference: string
  Status: string
  'Assigned To': string
  'Response Date': string
  Notes: string
}

// Dashboard Types
export interface DashboardStats {
  totalEnquiries: number
  newEnquiries: number
  inProgress: number
  converted: number
  conversionRate: number
  avgResponseTime: number
  totalRevenue: number
}

export interface BarristerPerformance {
  id: string
  name: string
  engagementScore: number
  conversionRate: number
  avgResponseTime: number
  totalRevenue: number
  tasksCompleted: number
  rank: number
}

// Form Types
export interface CreateEnquiryForm {
  client_name: string
  client_type: 'Individual' | 'Company' | 'Solicitor'
  client_email?: string
  client_phone?: string
  source: 'Email' | 'Phone' | 'Website' | 'Referral' | 'Direct'
  practice_area: string
  matter_type: string
  description: string
  estimated_value?: number
  urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
}

export interface CreateBarristerForm {
  name: string
  email: string
  year_of_call?: number
  practice_areas: string[]
  seniority: 'Pupil' | 'Junior' | 'Middle' | 'Senior' | 'KC'
}

export interface AssignEnquiryForm {
  assigned_barrister_id: string
  assigned_clerk_id: string
  notes?: string
}