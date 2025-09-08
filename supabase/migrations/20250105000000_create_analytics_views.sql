-- =============================================================================
-- BDIP Analytics Views
-- Version: 20250105000000_create_analytics_views.sql
-- Purpose: Pre-built views for dashboard queries and complex analytics
-- =============================================================================

-- =============================================================================
-- DASHBOARD PERFORMANCE VIEWS
-- =============================================================================

-- Daily dashboard statistics view
CREATE OR REPLACE VIEW public.daily_dashboard_stats AS
SELECT 
  CURRENT_DATE as stats_date,
  
  -- Enquiry counts
  COUNT(*) FILTER (WHERE DATE(received_at) = CURRENT_DATE) as new_enquiries_today,
  COUNT(*) FILTER (WHERE status = 'New' AND deleted_at IS NULL) as total_new_enquiries,
  COUNT(*) FILTER (WHERE status = 'In Progress' AND deleted_at IS NULL) as total_in_progress,
  COUNT(*) FILTER (WHERE status = 'Converted' AND deleted_at IS NULL) as total_converted,
  COUNT(*) FILTER (WHERE status = 'Lost' AND deleted_at IS NULL) as total_lost,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_enquiries,
  
  -- Conversion metrics
  ROUND(
    COUNT(*) FILTER (WHERE status = 'Converted' AND deleted_at IS NULL)::DECIMAL /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('Converted', 'Lost') AND deleted_at IS NULL), 0) * 100,
    2
  ) as conversion_rate_percent,
  
  -- Response time metrics
  ROUND(AVG(response_time_hours) FILTER (WHERE response_time_hours IS NOT NULL), 2) as avg_response_time_hours,
  ROUND(AVG(response_time_hours) FILTER (WHERE responded_at >= CURRENT_DATE - INTERVAL '7 days'), 2) as avg_response_time_7days,
  
  -- Value metrics
  COALESCE(SUM(actual_value) FILTER (WHERE status = 'Converted' AND deleted_at IS NULL), 0) as total_converted_value,
  COALESCE(SUM(estimated_value) FILTER (WHERE status IN ('New', 'Assigned', 'In Progress') AND deleted_at IS NULL), 0) as pipeline_value,
  
  -- Today's performance
  COUNT(*) FILTER (WHERE responded_at >= CURRENT_DATE) as responses_today,
  COUNT(*) FILTER (WHERE converted_at >= CURRENT_DATE) as conversions_today,
  COALESCE(SUM(actual_value) FILTER (WHERE converted_at >= CURRENT_DATE), 0) as revenue_today

FROM public.enquiries;

-- Weekly performance trends
CREATE OR REPLACE VIEW public.weekly_performance_trends AS
WITH weekly_stats AS (
  SELECT 
    DATE_TRUNC('week', received_at)::DATE as week_start,
    COUNT(*) as enquiries_received,
    COUNT(*) FILTER (WHERE status = 'Converted') as enquiries_converted,
    COUNT(*) FILTER (WHERE status = 'Lost') as enquiries_lost,
    AVG(response_time_hours) as avg_response_time,
    SUM(actual_value) FILTER (WHERE status = 'Converted') as revenue
  FROM public.enquiries 
  WHERE received_at >= CURRENT_DATE - INTERVAL '12 weeks'
  AND deleted_at IS NULL
  GROUP BY DATE_TRUNC('week', received_at)
)
SELECT 
  week_start,
  enquiries_received,
  enquiries_converted,
  enquiries_lost,
  ROUND((enquiries_converted::DECIMAL / NULLIF(enquiries_converted + enquiries_lost, 0) * 100), 2) as conversion_rate,
  ROUND(avg_response_time, 2) as avg_response_time,
  COALESCE(revenue, 0) as revenue
FROM weekly_stats
ORDER BY week_start DESC;

-- =============================================================================
-- BARRISTER PERFORMANCE VIEWS
-- =============================================================================

-- Comprehensive barrister performance view
CREATE OR REPLACE VIEW public.barrister_performance AS
SELECT 
  b.id,
  b.name,
  b.seniority,
  b.practice_areas,
  b.engagement_score,
  b.current_workload,
  b.max_workload,
  
  -- Enquiry metrics (last 90 days)
  COUNT(e.id) FILTER (WHERE e.deleted_at IS NULL AND e.received_at >= CURRENT_DATE - INTERVAL '90 days') as enquiries_assigned_90d,
  COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.deleted_at IS NULL AND e.converted_at >= CURRENT_DATE - INTERVAL '90 days') as enquiries_converted_90d,
  COUNT(e.id) FILTER (WHERE e.status = 'Lost' AND e.deleted_at IS NULL AND e.lost_at >= CURRENT_DATE - INTERVAL '90 days') as enquiries_lost_90d,
  
  -- Conversion rate calculation
  ROUND(
    COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.deleted_at IS NULL AND e.converted_at >= CURRENT_DATE - INTERVAL '90 days')::DECIMAL /
    NULLIF(COUNT(e.id) FILTER (WHERE e.status IN ('Converted', 'Lost') AND e.deleted_at IS NULL AND COALESCE(e.converted_at, e.lost_at) >= CURRENT_DATE - INTERVAL '90 days'), 0) * 100,
    2
  ) as conversion_rate_90d,
  
  -- Response time metrics
  ROUND(AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '90 days'), 2) as avg_response_time_90d,
  
  -- Revenue metrics
  COALESCE(SUM(e.actual_value) FILTER (WHERE e.status = 'Converted' AND e.deleted_at IS NULL AND e.converted_at >= CURRENT_DATE - INTERVAL '90 days'), 0) as revenue_90d,
  
  -- Task completion metrics
  COUNT(t.id) FILTER (WHERE t.completed_at >= CURRENT_DATE - INTERVAL '90 days' AND t.deleted_at IS NULL) as tasks_completed_90d,
  ROUND(AVG(t.quality_score) FILTER (WHERE t.quality_score IS NOT NULL AND t.completed_at >= CURRENT_DATE - INTERVAL '90 days'), 2) as avg_task_quality_90d,
  
  -- Current status
  COUNT(e.id) FILTER (WHERE e.status IN ('Assigned', 'In Progress') AND e.deleted_at IS NULL) as current_active_enquiries,
  COUNT(t.id) FILTER (WHERE t.status IN ('Pending', 'In Progress') AND t.deleted_at IS NULL) as current_pending_tasks,
  
  -- Ranking components
  ROW_NUMBER() OVER (ORDER BY b.engagement_score DESC) as engagement_rank,
  ROW_NUMBER() OVER (ORDER BY 
    COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.deleted_at IS NULL AND e.converted_at >= CURRENT_DATE - INTERVAL '90 days')::DECIMAL /
    NULLIF(COUNT(e.id) FILTER (WHERE e.status IN ('Converted', 'Lost') AND e.deleted_at IS NULL AND COALESCE(e.converted_at, e.lost_at) >= CURRENT_DATE - INTERVAL '90 days'), 0) 
    DESC
  ) as conversion_rank

FROM public.barristers b
LEFT JOIN public.enquiries e ON e.assigned_barrister_id = b.id
LEFT JOIN public.tasks t ON t.barrister_id = b.id
WHERE b.is_active = true AND b.deleted_at IS NULL
GROUP BY b.id, b.name, b.seniority, b.practice_areas, b.engagement_score, b.current_workload, b.max_workload;

-- Top performing barristers (current month)
CREATE OR REPLACE VIEW public.top_barristers_current_month AS
SELECT 
  b.id,
  b.name,
  b.seniority,
  b.engagement_score,
  COUNT(e.id) FILTER (WHERE e.status = 'Converted') as conversions_this_month,
  COALESCE(SUM(e.actual_value), 0) as revenue_this_month,
  ROUND(AVG(e.response_time_hours), 2) as avg_response_time_this_month,
  ROW_NUMBER() OVER (ORDER BY 
    COUNT(e.id) FILTER (WHERE e.status = 'Converted') DESC,
    b.engagement_score DESC
  ) as rank_this_month
FROM public.barristers b
LEFT JOIN public.enquiries e ON e.assigned_barrister_id = b.id 
  AND e.converted_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND e.deleted_at IS NULL
WHERE b.is_active = true AND b.deleted_at IS NULL
GROUP BY b.id, b.name, b.seniority, b.engagement_score
ORDER BY rank_this_month
LIMIT 10;

-- =============================================================================
-- CLERKS WORKLOAD VIEWS
-- =============================================================================

-- Clerk workload and performance view
CREATE OR REPLACE VIEW public.clerk_workload_view AS
SELECT 
  c.id,
  c.name,
  c.team,
  c.is_senior,
  c.current_workload,
  c.max_workload,
  c.avg_response_time_hours,
  
  -- Workload utilization
  ROUND((c.current_workload::DECIMAL / c.max_workload * 100), 1) as workload_percentage,
  
  -- Assignment metrics (last 30 days)
  COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '30 days') as enquiries_assigned_30d,
  COUNT(e.id) FILTER (WHERE e.responded_at >= CURRENT_DATE - INTERVAL '30 days') as enquiries_responded_30d,
  COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '30 days') as enquiries_converted_30d,
  
  -- Response efficiency
  ROUND(
    COUNT(e.id) FILTER (WHERE e.responded_at >= CURRENT_DATE - INTERVAL '30 days')::DECIMAL /
    NULLIF(COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '30 days'), 0) * 100,
    1
  ) as response_rate_30d,
  
  -- Current queue
  COUNT(e.id) FILTER (WHERE e.status = 'New' AND e.deleted_at IS NULL) as new_enquiries_queue,
  COUNT(e.id) FILTER (WHERE e.status = 'Assigned' AND e.responded_at IS NULL AND e.deleted_at IS NULL) as pending_responses

FROM public.clerks c
LEFT JOIN public.enquiries e ON e.assigned_clerk_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, c.team, c.is_senior, c.current_workload, c.max_workload, c.avg_response_time_hours;

-- =============================================================================
-- CLIENT AND BUSINESS DEVELOPMENT VIEWS
-- =============================================================================

-- Top clients by value and relationship strength
CREATE OR REPLACE VIEW public.top_clients AS
SELECT 
  c.id,
  c.name,
  c.type,
  c.total_value,
  c.matter_count,
  c.first_instruction,
  c.last_instruction,
  
  -- Recent activity
  COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '12 months' AND e.deleted_at IS NULL) as enquiries_12m,
  COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '12 months' AND e.deleted_at IS NULL) as conversions_12m,
  COALESCE(SUM(e.actual_value) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '12 months'), 0) as revenue_12m,
  
  -- Client relationship strength (days since last instruction)
  CASE 
    WHEN c.last_instruction IS NULL THEN 'No Instructions'
    WHEN c.last_instruction >= CURRENT_DATE - INTERVAL '3 months' THEN 'Very Active'
    WHEN c.last_instruction >= CURRENT_DATE - INTERVAL '6 months' THEN 'Active'
    WHEN c.last_instruction >= CURRENT_DATE - INTERVAL '12 months' THEN 'Inactive'
    ELSE 'Very Inactive'
  END as relationship_status,
  
  -- Last enquiry date
  MAX(e.received_at) as last_enquiry_date

FROM public.clients c
LEFT JOIN public.enquiries e ON e.client_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, c.type, c.total_value, c.matter_count, c.first_instruction, c.last_instruction
ORDER BY c.total_value DESC, c.matter_count DESC;

-- Practice area performance analysis
CREATE OR REPLACE VIEW public.practice_area_performance AS
SELECT 
  COALESCE(e.practice_area, 'Unspecified') as practice_area,
  
  -- Volume metrics
  COUNT(*) as total_enquiries,
  COUNT(*) FILTER (WHERE e.status = 'Converted') as converted_enquiries,
  COUNT(*) FILTER (WHERE e.status = 'Lost') as lost_enquiries,
  COUNT(*) FILTER (WHERE e.status IN ('New', 'Assigned', 'In Progress')) as active_enquiries,
  
  -- Performance metrics
  ROUND(
    COUNT(*) FILTER (WHERE e.status = 'Converted')::DECIMAL /
    NULLIF(COUNT(*) FILTER (WHERE e.status IN ('Converted', 'Lost')), 0) * 100,
    2
  ) as conversion_rate,
  
  ROUND(AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL), 2) as avg_response_time,
  
  -- Value metrics
  COALESCE(SUM(e.actual_value) FILTER (WHERE e.status = 'Converted'), 0) as total_revenue,
  COALESCE(AVG(e.actual_value) FILTER (WHERE e.status = 'Converted'), 0) as avg_matter_value,
  COALESCE(SUM(e.estimated_value) FILTER (WHERE e.status IN ('New', 'Assigned', 'In Progress')), 0) as pipeline_value,
  
  -- Resource allocation
  COUNT(DISTINCT e.assigned_barrister_id) as barristers_involved,
  COUNT(DISTINCT e.assigned_clerk_id) as clerks_involved

FROM public.enquiries e
WHERE e.deleted_at IS NULL
AND e.received_at >= CURRENT_DATE - INTERVAL '12 months' -- Last 12 months
GROUP BY COALESCE(e.practice_area, 'Unspecified')
ORDER BY total_revenue DESC, conversion_rate DESC;

-- =============================================================================
-- SOURCE AND MARKETING ANALYTICS
-- =============================================================================

-- Enquiry source performance
CREATE OR REPLACE VIEW public.source_performance_analysis AS
SELECT 
  e.source,
  
  -- Volume and trends
  COUNT(*) as total_enquiries,
  COUNT(*) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '30 days') as enquiries_30d,
  COUNT(*) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '7 days') as enquiries_7d,
  
  -- Conversion performance
  COUNT(*) FILTER (WHERE e.status = 'Converted') as total_conversions,
  ROUND(
    COUNT(*) FILTER (WHERE e.status = 'Converted')::DECIMAL /
    NULLIF(COUNT(*) FILTER (WHERE e.status IN ('Converted', 'Lost')), 0) * 100,
    2
  ) as conversion_rate,
  
  -- Quality indicators
  ROUND(AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL), 2) as avg_response_time,
  ROUND(AVG(e.conversion_probability), 3) as avg_conversion_probability,
  
  -- Value metrics
  COALESCE(SUM(e.actual_value) FILTER (WHERE e.status = 'Converted'), 0) as total_revenue,
  COALESCE(AVG(e.actual_value) FILTER (WHERE e.status = 'Converted'), 0) as avg_conversion_value,
  COALESCE(AVG(e.estimated_value), 0) as avg_estimated_value

FROM public.enquiries e
WHERE e.deleted_at IS NULL
AND e.received_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY e.source
ORDER BY conversion_rate DESC, total_revenue DESC;

-- =============================================================================
-- CONVERSION FUNNEL ANALYSIS
-- =============================================================================

-- Comprehensive conversion funnel view
CREATE OR REPLACE VIEW public.conversion_funnel AS
WITH funnel_data AS (
  SELECT 
    COUNT(*) as total_enquiries,
    COUNT(*) FILTER (WHERE assigned_clerk_id IS NOT NULL) as assigned_to_clerk,
    COUNT(*) FILTER (WHERE assigned_barrister_id IS NOT NULL) as assigned_to_barrister,
    COUNT(*) FILTER (WHERE responded_at IS NOT NULL) as received_response,
    COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress,
    COUNT(*) FILTER (WHERE status = 'Converted') as converted,
    COUNT(*) FILTER (WHERE status = 'Lost') as lost,
    
    -- Time-based metrics
    AVG(response_time_hours) FILTER (WHERE response_time_hours IS NOT NULL) as avg_response_time,
    AVG(EXTRACT(EPOCH FROM (converted_at - received_at)) / 86400) FILTER (WHERE converted_at IS NOT NULL) as avg_days_to_convert
    
  FROM public.enquiries 
  WHERE deleted_at IS NULL 
  AND received_at >= CURRENT_DATE - INTERVAL '90 days'
)
SELECT 
  total_enquiries,
  assigned_to_clerk,
  assigned_to_barrister,
  received_response,
  in_progress,
  converted,
  lost,
  
  -- Conversion rates at each stage
  ROUND((assigned_to_clerk::DECIMAL / NULLIF(total_enquiries, 0) * 100), 2) as clerk_assignment_rate,
  ROUND((assigned_to_barrister::DECIMAL / NULLIF(assigned_to_clerk, 0) * 100), 2) as barrister_assignment_rate,
  ROUND((received_response::DECIMAL / NULLIF(assigned_to_barrister, 0) * 100), 2) as response_rate,
  ROUND((converted::DECIMAL / NULLIF(received_response, 0) * 100), 2) as conversion_after_response_rate,
  ROUND((converted::DECIMAL / NULLIF(total_enquiries, 0) * 100), 2) as overall_conversion_rate,
  
  -- Drop-off analysis
  (total_enquiries - assigned_to_clerk) as unassigned_dropoff,
  (assigned_to_clerk - assigned_to_barrister) as clerk_to_barrister_dropoff,
  (assigned_to_barrister - received_response) as no_response_dropoff,
  lost as lost_after_response,
  
  -- Time metrics
  ROUND(avg_response_time, 2) as avg_response_time_hours,
  ROUND(avg_days_to_convert, 1) as avg_days_to_convert

FROM funnel_data;

-- =============================================================================
-- REAL-TIME OPERATIONAL VIEWS
-- =============================================================================

-- Urgent items requiring attention
CREATE OR REPLACE VIEW public.urgent_attention_items AS
SELECT 
  'Overdue Response' as item_type,
  e.id as item_id,
  e.lex_reference as reference,
  'Enquiry' as entity_type,
  CONCAT('Response overdue: ', c.name, ' - ', COALESCE(e.practice_area, 'General')) as description,
  e.urgency as priority,
  e.received_at as created_at,
  EXTRACT(EPOCH FROM (NOW() - e.received_at)) / 3600 as hours_overdue,
  CONCAT('/enquiries/', e.id) as link
FROM public.enquiries e
LEFT JOIN public.clients c ON c.id = e.client_id
WHERE e.status IN ('Assigned', 'In Progress')
AND e.responded_at IS NULL
AND e.deleted_at IS NULL
AND (
  (e.urgency = 'Immediate' AND e.received_at < NOW() - INTERVAL '2 hours') OR
  (e.urgency = 'This Week' AND e.received_at < NOW() - INTERVAL '24 hours') OR
  (e.urgency = 'This Month' AND e.received_at < NOW() - INTERVAL '72 hours')
)

UNION ALL

SELECT 
  'Overdue Task' as item_type,
  t.id as item_id,
  COALESCE(e.lex_reference, t.id::text) as reference,
  'Task' as entity_type,
  CONCAT('Task overdue: ', t.title) as description,
  t.priority as priority,
  t.created_at,
  EXTRACT(EPOCH FROM (NOW() - t.due_date)) / 3600 as hours_overdue,
  CONCAT('/tasks/', t.id) as link
FROM public.tasks t
LEFT JOIN public.enquiries e ON e.id = t.enquiry_id
WHERE t.status IN ('Pending', 'In Progress')
AND t.due_date < NOW()
AND t.deleted_at IS NULL

ORDER BY hours_overdue DESC, priority DESC
LIMIT 20;

-- =============================================================================
-- GRANT VIEW PERMISSIONS
-- =============================================================================

-- Grant select permissions to authenticated users based on their roles
-- These will be filtered by RLS policies

GRANT SELECT ON public.daily_dashboard_stats TO authenticated;
GRANT SELECT ON public.weekly_performance_trends TO authenticated;
GRANT SELECT ON public.barrister_performance TO authenticated;
GRANT SELECT ON public.top_barristers_current_month TO authenticated;
GRANT SELECT ON public.clerk_workload_view TO authenticated;
GRANT SELECT ON public.top_clients TO authenticated;
GRANT SELECT ON public.practice_area_performance TO authenticated;
GRANT SELECT ON public.source_performance_analysis TO authenticated;
GRANT SELECT ON public.conversion_funnel TO authenticated;
GRANT SELECT ON public.urgent_attention_items TO authenticated;

-- =============================================================================
-- ANALYTICS VIEWS COMPLETE
-- =============================================================================

-- Log migration completion
INSERT INTO _supabase_migrations (version) VALUES ('20250105000000') 
ON CONFLICT (version) DO NOTHING;