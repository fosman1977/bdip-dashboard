/**
 * Dashboard API types and interfaces for BDIP
 * Defines data structures for role-based dashboard endpoints
 */

import { z } from 'zod'

// Base interfaces
export interface BaseUser {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'clerk' | 'barrister' | 'read_only'
  avatar_url?: string
}

export interface EnquiryBase {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'new' | 'assigned' | 'in_progress' | 'waiting_client' | 'completed' | 'cancelled'
  client_id: string
  client_name: string
  created_at: string
  updated_at: string
  due_date?: string
}

export interface TaskBase {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  due_date?: string
  created_at: string
  updated_at: string
}

// Clerk Dashboard Types
export interface ClerkDashboardStats {
  total_enquiries: number
  pending_assignments: number
  active_cases: number
  overdue_tasks: number
  new_enquiries_today: number
  completed_this_week: number
}

export interface ClerkEnquiry extends EnquiryBase {
  assigned_barrister_id?: string
  assigned_barrister_name?: string
  assignment_date?: string
  urgency_score: number
}

export interface BarristerWorkload {
  barrister_id: string
  barrister_name: string
  active_cases: number
  pending_tasks: number
  capacity_percentage: number
  specializations: string[]
  engagement_score: number
  availability_status: 'available' | 'busy' | 'unavailable'
  next_available_date?: string
}

export interface ClerkDashboardData {
  stats: ClerkDashboardStats
  recent_enquiries: ClerkEnquiry[]
  pending_assignments: ClerkEnquiry[]
  barrister_workloads: BarristerWorkload[]
  urgent_tasks: (TaskBase & { assigned_to: string })[]
  performance_metrics: {
    assignment_efficiency: number
    average_response_time_hours: number
    client_satisfaction_score: number
  }
}

// Barrister Dashboard Types
export interface BarristerDashboardStats {
  active_cases: number
  pending_tasks: number
  completed_this_month: number
  upcoming_deadlines: number
  total_billable_hours: number
  engagement_score: number
}

export interface BarristerEnquiry extends EnquiryBase {
  assigned_date: string
  time_spent_hours: number
  billable_rate?: number
  progress_percentage: number
}

export interface BarristerTask extends TaskBase {
  enquiry_id?: string
  enquiry_title?: string
  estimated_hours?: number
  actual_hours?: number
}

export interface BarristerDashboardData {
  stats: BarristerDashboardStats
  active_enquiries: BarristerEnquiry[]
  pending_tasks: BarristerTask[]
  upcoming_deadlines: (BarristerEnquiry | BarristerTask)[]
  recent_completions: BarristerEnquiry[]
  performance_trends: {
    monthly_cases: { month: string; cases: number; hours: number }[]
    specialization_breakdown: { area: string; cases: number; percentage: number }[]
    client_feedback_average: number
  }
}

// Admin Dashboard Types
export interface AdminDashboardStats {
  total_users: number
  active_users_today: number
  total_enquiries: number
  total_clients: number
  system_health_score: number
  revenue_this_month: number
}

export interface UserActivity {
  user_id: string
  user_name: string
  role: string
  last_active: string
  actions_today: number
  engagement_score: number
}

export interface SystemMetrics {
  api_response_time_ms: number
  database_connections: number
  memory_usage_percent: number
  cpu_usage_percent: number
  error_rate_percent: number
  uptime_hours: number
}

export interface AdminDashboardData {
  stats: AdminDashboardStats
  user_activities: UserActivity[]
  system_metrics: SystemMetrics
  enquiry_trends: { date: string; count: number; completed: number }[]
  performance_overview: {
    avg_assignment_time_hours: number
    avg_completion_time_days: number
    client_satisfaction_avg: number
    barrister_utilization_avg: number
  }
  alerts: {
    id: string
    type: 'warning' | 'error' | 'info'
    message: string
    created_at: string
    resolved: boolean
  }[]
}

// Enquiry Queue Types
export interface QueueEnquiry extends EnquiryBase {
  urgency_score: number
  client_tier: 'standard' | 'premium' | 'vip'
  waiting_time_hours: number
  estimated_complexity: 'simple' | 'moderate' | 'complex'
  required_specializations: string[]
  preferred_barrister_id?: string
  queue_position: number
}

export interface EnquiryQueueData {
  queue: QueueEnquiry[]
  queue_stats: {
    total_in_queue: number
    avg_wait_time_hours: number
    urgent_count: number
    vip_client_count: number
  }
  available_barristers: BarristerWorkload[]
  assignment_recommendations: {
    enquiry_id: string
    recommended_barrister_id: string
    match_score: number
    reasoning: string
  }[]
}

// Engagement Metrics Types
export interface EngagementMetrics {
  user_id: string
  user_name: string
  role: string
  engagement_score: number
  metrics: {
    login_frequency: number
    task_completion_rate: number
    response_time_hours: number
    quality_score: number
    collaboration_index: number
  }
  trends: {
    date: string
    score: number
  }[]
}

export interface EngagementData {
  overall_metrics: {
    chamber_avg_engagement: number
    top_performer_score: number
    improvement_opportunities: number
  }
  user_metrics: EngagementMetrics[]
  role_comparisons: {
    role: string
    avg_engagement: number
    user_count: number
  }[]
}

// Bulk Actions Types
export interface BulkAssignmentRequest {
  enquiry_ids: string[]
  barrister_id: string
  assignment_notes?: string
  priority_adjustment?: 'increase' | 'decrease' | 'maintain'
}

export interface BulkAssignmentResult {
  successful_assignments: {
    enquiry_id: string
    enquiry_title: string
    assigned_to: string
  }[]
  failed_assignments: {
    enquiry_id: string
    error: string
    reason: string
  }[]
  summary: {
    total_processed: number
    successful: number
    failed: number
    processing_time_ms: number
  }
}

// Request/Response Schemas
export const ClerkDashboardParamsSchema = z.object({
  date_range: z.enum(['today', 'week', 'month', 'quarter']).optional().default('week'),
  include_completed: z.boolean().optional().default(false),
  limit: z.number().min(1).max(100).optional().default(20)
})

export const BarristerDashboardParamsSchema = z.object({
  date_range: z.enum(['today', 'week', 'month', 'quarter']).optional().default('month'),
  include_archived: z.boolean().optional().default(false)
})

export const AdminDashboardParamsSchema = z.object({
  date_range: z.enum(['today', 'week', 'month', 'quarter', 'year']).optional().default('month'),
  include_inactive_users: z.boolean().optional().default(false)
})

export const EnquiryQueueParamsSchema = z.object({
  priority_filter: z.array(z.enum(['low', 'medium', 'high', 'urgent'])).optional(),
  specialization_filter: z.array(z.string()).optional(),
  client_tier_filter: z.array(z.enum(['standard', 'premium', 'vip'])).optional(),
  limit: z.number().min(1).max(200).optional().default(50)
})

export const EngagementMetricsParamsSchema = z.object({
  role_filter: z.array(z.enum(['admin', 'clerk', 'barrister', 'read_only'])).optional(),
  date_range: z.enum(['week', 'month', 'quarter', 'year']).optional().default('month'),
  include_trends: z.boolean().optional().default(true)
})

export const BulkAssignmentSchema = z.object({
  enquiry_ids: z.array(z.string().uuid()).min(1).max(50),
  barrister_id: z.string().uuid(),
  assignment_notes: z.string().max(500).optional(),
  priority_adjustment: z.enum(['increase', 'decrease', 'maintain']).optional()
})

// API Response wrapper
export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    message: string
    code: string
    details?: any
  }
  meta?: {
    timestamp: string
    request_id: string
    processing_time_ms: number
    cached: boolean
    cache_ttl?: number
  }
}

// Export type helpers
export type ClerkDashboardParams = z.infer<typeof ClerkDashboardParamsSchema>
export type BarristerDashboardParams = z.infer<typeof BarristerDashboardParamsSchema>
export type AdminDashboardParams = z.infer<typeof AdminDashboardParamsSchema>
export type EnquiryQueueParams = z.infer<typeof EnquiryQueueParamsSchema>
export type EngagementMetricsParams = z.infer<typeof EngagementMetricsParamsSchema>
export type BulkAssignmentParams = z.infer<typeof BulkAssignmentSchema>