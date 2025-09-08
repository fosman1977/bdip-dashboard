-- =============================================================================
-- BDIP Real-Time Dashboard Materialized Views
-- Version: 20250110000000_create_dashboard_materialized_views.sql
-- Purpose: High-performance materialized views for dashboard data aggregation
-- =============================================================================

-- Enable required extensions for advanced indexing and real-time features
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- =============================================================================
-- DASHBOARD METRICS MATERIALIZED VIEWS
-- =============================================================================

-- Real-time enquiry metrics (refreshes every 5 minutes)
-- Optimized for 10,000+ enquiries with sub-second query performance
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_enquiry_metrics AS
SELECT 
    -- Time dimensions for time-series analysis
    DATE_TRUNC('hour', e.received_at) as hour_bucket,
    DATE_TRUNC('day', e.received_at) as day_bucket,
    DATE_TRUNC('week', e.received_at) as week_bucket,
    DATE_TRUNC('month', e.received_at) as month_bucket,
    
    -- Segmentation dimensions
    COALESCE(e.practice_area, 'Unspecified') as practice_area,
    e.source,
    e.urgency,
    e.complexity,
    e.status,
    e.assigned_clerk_id,
    e.assigned_barrister_id,
    
    -- Aggregated metrics
    COUNT(*) as enquiry_count,
    COUNT(*) FILTER (WHERE e.status = 'New') as new_count,
    COUNT(*) FILTER (WHERE e.status = 'Assigned') as assigned_count,
    COUNT(*) FILTER (WHERE e.status = 'In Progress') as in_progress_count,
    COUNT(*) FILTER (WHERE e.status = 'Converted') as converted_count,
    COUNT(*) FILTER (WHERE e.status = 'Lost') as lost_count,
    COUNT(*) FILTER (WHERE e.status = 'On Hold') as on_hold_count,
    
    -- Response time metrics
    COUNT(*) FILTER (WHERE e.responded_at IS NOT NULL) as responded_count,
    AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL) as avg_response_time_hours,
    MIN(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL) as min_response_time_hours,
    MAX(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL) as max_response_time_hours,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL) as median_response_time_hours,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL) as p90_response_time_hours,
    
    -- Value metrics
    SUM(COALESCE(e.estimated_value, 0)) as total_estimated_value,
    SUM(COALESCE(e.actual_value, 0)) as total_actual_value,
    AVG(e.estimated_value) FILTER (WHERE e.estimated_value IS NOT NULL) as avg_estimated_value,
    AVG(e.actual_value) FILTER (WHERE e.actual_value IS NOT NULL) as avg_actual_value,
    
    -- Conversion metrics
    ROUND(
        COUNT(*) FILTER (WHERE e.status = 'Converted')::DECIMAL /
        NULLIF(COUNT(*) FILTER (WHERE e.status IN ('Converted', 'Lost')), 0) * 100,
        2
    ) as conversion_rate_percent,
    
    -- Quality metrics
    AVG(e.conversion_probability) FILTER (WHERE e.conversion_probability IS NOT NULL) as avg_conversion_probability,
    
    -- Time to conversion metrics
    AVG(EXTRACT(EPOCH FROM (e.converted_at - e.received_at)) / 3600) FILTER (WHERE e.converted_at IS NOT NULL) as avg_hours_to_convert,
    
    -- Metadata
    NOW() as last_updated

FROM public.enquiries e
WHERE e.deleted_at IS NULL
GROUP BY 
    DATE_TRUNC('hour', e.received_at),
    DATE_TRUNC('day', e.received_at),
    DATE_TRUNC('week', e.received_at),
    DATE_TRUNC('month', e.received_at),
    COALESCE(e.practice_area, 'Unspecified'),
    e.source,
    e.urgency,
    e.complexity,
    e.status,
    e.assigned_clerk_id,
    e.assigned_barrister_id;

-- Unique index for fast lookups and concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_enquiry_metrics_unique 
ON public.mv_enquiry_metrics(
    hour_bucket, practice_area, source, urgency, complexity, status,
    COALESCE(assigned_clerk_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(assigned_barrister_id, '00000000-0000-0000-0000-000000000000'::UUID)
);

-- Performance indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_mv_enquiry_metrics_day 
ON public.mv_enquiry_metrics(day_bucket DESC, practice_area, status);

CREATE INDEX IF NOT EXISTS idx_mv_enquiry_metrics_week 
ON public.mv_enquiry_metrics(week_bucket DESC, source, status);

CREATE INDEX IF NOT EXISTS idx_mv_enquiry_metrics_clerk 
ON public.mv_enquiry_metrics(assigned_clerk_id, day_bucket DESC) 
WHERE assigned_clerk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mv_enquiry_metrics_barrister 
ON public.mv_enquiry_metrics(assigned_barrister_id, day_bucket DESC) 
WHERE assigned_barrister_id IS NOT NULL;

-- =============================================================================
-- BARRISTER PERFORMANCE MATERIALIZED VIEW
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_barrister_performance AS
WITH performance_calculations AS (
    SELECT 
        b.id,
        b.name,
        b.seniority,
        b.practice_areas,
        b.engagement_score,
        b.current_workload,
        b.max_workload,
        
        -- Time-based performance metrics (30, 90, 365 days)
        COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL) as enquiries_30d,
        COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '90 days' AND e.deleted_at IS NULL) as enquiries_90d,
        COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '365 days' AND e.deleted_at IS NULL) as enquiries_365d,
        
        -- Conversion metrics by period
        COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL) as converted_30d,
        COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '90 days' AND e.deleted_at IS NULL) as converted_90d,
        COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '365 days' AND e.deleted_at IS NULL) as converted_365d,
        
        -- Lost enquiry metrics
        COUNT(e.id) FILTER (WHERE e.status = 'Lost' AND e.lost_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL) as lost_30d,
        COUNT(e.id) FILTER (WHERE e.status = 'Lost' AND e.lost_at >= CURRENT_DATE - INTERVAL '90 days' AND e.deleted_at IS NULL) as lost_90d,
        
        -- Response time metrics
        AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '30 days') as avg_response_time_30d,
        AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '90 days') as avg_response_time_90d,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '90 days') as median_response_time_90d,
        
        -- Revenue metrics
        SUM(e.actual_value) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL) as revenue_30d,
        SUM(e.actual_value) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '90 days' AND e.deleted_at IS NULL) as revenue_90d,
        SUM(e.actual_value) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '365 days' AND e.deleted_at IS NULL) as revenue_365d,
        
        -- Task completion metrics
        COUNT(t.id) FILTER (WHERE t.completed_at >= CURRENT_DATE - INTERVAL '30 days' AND t.deleted_at IS NULL) as tasks_completed_30d,
        COUNT(t.id) FILTER (WHERE t.completed_at >= CURRENT_DATE - INTERVAL '90 days' AND t.deleted_at IS NULL) as tasks_completed_90d,
        AVG(t.quality_score) FILTER (WHERE t.quality_score IS NOT NULL AND t.completed_at >= CURRENT_DATE - INTERVAL '90 days') as avg_task_quality_90d,
        SUM(t.actual_hours) FILTER (WHERE t.completed_at >= CURRENT_DATE - INTERVAL '90 days' AND t.actual_hours IS NOT NULL) as total_hours_90d,
        
        -- Current workload
        COUNT(e.id) FILTER (WHERE e.status IN ('Assigned', 'In Progress') AND e.deleted_at IS NULL) as current_active_enquiries,
        COUNT(t.id) FILTER (WHERE t.status IN ('Pending', 'In Progress') AND t.deleted_at IS NULL) as current_pending_tasks,
        COUNT(t.id) FILTER (WHERE t.status IN ('Pending', 'In Progress') AND t.due_date < NOW() AND t.deleted_at IS NULL) as overdue_tasks
        
    FROM public.barristers b
    LEFT JOIN public.enquiries e ON e.assigned_barrister_id = b.id
    LEFT JOIN public.tasks t ON t.barrister_id = b.id
    WHERE b.is_active = true AND b.deleted_at IS NULL
    GROUP BY b.id, b.name, b.seniority, b.practice_areas, b.engagement_score, b.current_workload, b.max_workload
)
SELECT 
    *,
    
    -- Calculated conversion rates
    ROUND(converted_30d::DECIMAL / NULLIF(converted_30d + lost_30d, 0) * 100, 2) as conversion_rate_30d,
    ROUND(converted_90d::DECIMAL / NULLIF(converted_90d + lost_90d, 0) * 100, 2) as conversion_rate_90d,
    
    -- Workload utilization
    ROUND(current_workload::DECIMAL / NULLIF(max_workload, 0) * 100, 1) as workload_utilization_percent,
    
    -- Performance rankings
    ROW_NUMBER() OVER (ORDER BY engagement_score DESC) as engagement_rank,
    ROW_NUMBER() OVER (ORDER BY converted_90d DESC) as conversion_volume_rank_90d,
    ROW_NUMBER() OVER (ORDER BY ROUND(converted_90d::DECIMAL / NULLIF(converted_90d + lost_90d, 0) * 100, 2) DESC) as conversion_rate_rank_90d,
    ROW_NUMBER() OVER (ORDER BY COALESCE(revenue_90d, 0) DESC) as revenue_rank_90d,
    ROW_NUMBER() OVER (ORDER BY COALESCE(avg_response_time_90d, 999) ASC) as response_time_rank_90d,
    
    -- Efficiency metrics
    CASE 
        WHEN total_hours_90d > 0 AND revenue_90d > 0 THEN ROUND(revenue_90d / total_hours_90d, 2)
        ELSE NULL 
    END as revenue_per_hour_90d,
    
    CASE
        WHEN enquiries_30d = 0 THEN 'No Activity'
        WHEN ROUND(converted_30d::DECIMAL / NULLIF(converted_30d + lost_30d, 0) * 100, 2) >= 75 THEN 'Excellent'
        WHEN ROUND(converted_30d::DECIMAL / NULLIF(converted_30d + lost_30d, 0) * 100, 2) >= 50 THEN 'Good'
        WHEN ROUND(converted_30d::DECIMAL / NULLIF(converted_30d + lost_30d, 0) * 100, 2) >= 25 THEN 'Average'
        ELSE 'Needs Improvement'
    END as performance_category_30d,
    
    -- Last updated timestamp
    NOW() as last_updated

FROM performance_calculations;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_barrister_performance_id 
ON public.mv_barrister_performance(id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_mv_barrister_performance_engagement 
ON public.mv_barrister_performance(engagement_rank, seniority);

CREATE INDEX IF NOT EXISTS idx_mv_barrister_performance_conversion 
ON public.mv_barrister_performance(conversion_rate_rank_90d, seniority);

CREATE INDEX IF NOT EXISTS idx_mv_barrister_performance_revenue 
ON public.mv_barrister_performance(revenue_rank_90d, seniority);

CREATE INDEX IF NOT EXISTS idx_mv_barrister_performance_workload 
ON public.mv_barrister_performance(workload_utilization_percent DESC, current_active_enquiries);

-- =============================================================================
-- CLERK WORKLOAD MATERIALIZED VIEW
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_clerk_workload AS
SELECT 
    c.id,
    c.name,
    c.team,
    c.is_senior,
    c.current_workload,
    c.max_workload,
    
    -- Workload utilization
    ROUND(c.current_workload::DECIMAL / NULLIF(c.max_workload, 0) * 100, 1) as workload_utilization_percent,
    
    -- Queue metrics (real-time)
    COUNT(e.id) FILTER (WHERE e.status = 'New' AND e.deleted_at IS NULL) as new_enquiries_queue,
    COUNT(e.id) FILTER (WHERE e.status = 'Assigned' AND e.responded_at IS NULL AND e.deleted_at IS NULL) as pending_responses,
    COUNT(e.id) FILTER (WHERE e.status IN ('New', 'Assigned', 'In Progress') AND e.deleted_at IS NULL) as total_active_enquiries,
    
    -- Urgency breakdown
    COUNT(e.id) FILTER (WHERE e.status = 'New' AND e.urgency = 'Immediate' AND e.deleted_at IS NULL) as immediate_queue,
    COUNT(e.id) FILTER (WHERE e.status = 'New' AND e.urgency = 'This Week' AND e.deleted_at IS NULL) as this_week_queue,
    COUNT(e.id) FILTER (WHERE e.status = 'New' AND e.urgency = 'This Month' AND e.deleted_at IS NULL) as this_month_queue,
    COUNT(e.id) FILTER (WHERE e.status = 'New' AND e.urgency = 'Flexible' AND e.deleted_at IS NULL) as flexible_queue,
    
    -- Overdue items
    COUNT(e.id) FILTER (WHERE 
        e.status IN ('Assigned', 'In Progress') AND 
        e.responded_at IS NULL AND 
        e.deleted_at IS NULL AND
        ((e.urgency = 'Immediate' AND e.received_at < NOW() - INTERVAL '2 hours') OR
         (e.urgency = 'This Week' AND e.received_at < NOW() - INTERVAL '24 hours') OR
         (e.urgency = 'This Month' AND e.received_at < NOW() - INTERVAL '72 hours'))
    ) as overdue_responses,
    
    -- Performance metrics (last 30 days)
    COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL) as assigned_30d,
    COUNT(e.id) FILTER (WHERE e.responded_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL) as responded_30d,
    COUNT(e.id) FILTER (WHERE e.status = 'Converted' AND e.converted_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL) as converted_30d,
    
    -- Response efficiency
    ROUND(
        COUNT(e.id) FILTER (WHERE e.responded_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL)::DECIMAL /
        NULLIF(COUNT(e.id) FILTER (WHERE e.received_at >= CURRENT_DATE - INTERVAL '30 days' AND e.deleted_at IS NULL), 0) * 100,
        1
    ) as response_rate_30d,
    
    -- Average response times
    AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '30 days') as avg_response_time_30d,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '30 days') as median_response_time_30d,
    
    -- Availability status
    CASE 
        WHEN c.current_workload >= c.max_workload THEN 'At Capacity'
        WHEN c.current_workload >= (c.max_workload * 0.8) THEN 'Nearly Full'
        WHEN c.current_workload >= (c.max_workload * 0.5) THEN 'Moderate Load'
        ELSE 'Available'
    END as availability_status,
    
    -- Priority score for assignment algorithm
    CASE 
        WHEN c.current_workload >= c.max_workload THEN 0
        ELSE ROUND(
            ((c.max_workload - c.current_workload)::DECIMAL / c.max_workload * 50) +  -- Availability weight (50%)
            (CASE WHEN c.is_senior THEN 25 ELSE 0 END) +  -- Seniority bonus (25%)
            (CASE 
                WHEN AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '30 days') <= 2 THEN 15
                WHEN AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '30 days') <= 6 THEN 10
                WHEN AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL AND e.responded_at >= CURRENT_DATE - INTERVAL '30 days') <= 24 THEN 5
                ELSE 0
            END), -- Performance bonus (25%)
            1
        )
    END as assignment_priority_score,
    
    NOW() as last_updated
    
FROM public.clerks c
LEFT JOIN public.enquiries e ON e.assigned_clerk_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, c.team, c.is_senior, c.current_workload, c.max_workload;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_clerk_workload_id 
ON public.mv_clerk_workload(id);

-- Performance indexes for real-time queries
CREATE INDEX IF NOT EXISTS idx_mv_clerk_workload_availability 
ON public.mv_clerk_workload(availability_status, assignment_priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_mv_clerk_workload_team 
ON public.mv_clerk_workload(team, workload_utilization_percent ASC);

CREATE INDEX IF NOT EXISTS idx_mv_clerk_workload_queue 
ON public.mv_clerk_workload(new_enquiries_queue DESC, immediate_queue DESC);

-- =============================================================================
-- PRACTICE AREA PERFORMANCE MATERIALIZED VIEW
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_practice_area_performance AS
WITH monthly_data AS (
    SELECT 
        DATE_TRUNC('month', e.received_at) as month_bucket,
        COALESCE(e.practice_area, 'Unspecified') as practice_area,
        e.source,
        COUNT(*) as enquiry_count,
        COUNT(*) FILTER (WHERE e.status = 'Converted') as converted_count,
        COUNT(*) FILTER (WHERE e.status = 'Lost') as lost_count,
        SUM(e.actual_value) FILTER (WHERE e.status = 'Converted') as revenue,
        AVG(e.response_time_hours) FILTER (WHERE e.response_time_hours IS NOT NULL) as avg_response_time,
        AVG(e.conversion_probability) FILTER (WHERE e.conversion_probability IS NOT NULL) as avg_conversion_prob
    FROM public.enquiries e
    WHERE e.deleted_at IS NULL 
    AND e.received_at >= CURRENT_DATE - INTERVAL '24 months'
    GROUP BY DATE_TRUNC('month', e.received_at), COALESCE(e.practice_area, 'Unspecified'), e.source
)
SELECT 
    practice_area,
    source,
    
    -- Overall metrics
    SUM(enquiry_count) as total_enquiries,
    SUM(converted_count) as total_conversions,
    SUM(lost_count) as total_lost,
    SUM(COALESCE(revenue, 0)) as total_revenue,
    
    -- Performance rates
    ROUND(SUM(converted_count)::DECIMAL / NULLIF(SUM(converted_count + lost_count), 0) * 100, 2) as overall_conversion_rate,
    ROUND(AVG(avg_response_time), 2) as avg_response_time_hours,
    ROUND(AVG(avg_conversion_prob), 3) as avg_conversion_probability,
    
    -- Trend analysis (last 6 months vs previous 6 months)
    SUM(enquiry_count) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '6 months') as enquiries_l6m,
    SUM(enquiry_count) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '12 months' AND month_bucket < CURRENT_DATE - INTERVAL '6 months') as enquiries_p6m,
    SUM(converted_count) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '6 months') as conversions_l6m,
    SUM(converted_count) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '12 months' AND month_bucket < CURRENT_DATE - INTERVAL '6 months') as conversions_p6m,
    SUM(COALESCE(revenue, 0)) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '6 months') as revenue_l6m,
    SUM(COALESCE(revenue, 0)) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '12 months' AND month_bucket < CURRENT_DATE - INTERVAL '6 months') as revenue_p6m,
    
    -- Growth calculations
    ROUND(
        (SUM(enquiry_count) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '6 months')::DECIMAL - 
         SUM(enquiry_count) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '12 months' AND month_bucket < CURRENT_DATE - INTERVAL '6 months')) /
        NULLIF(SUM(enquiry_count) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '12 months' AND month_bucket < CURRENT_DATE - INTERVAL '6 months'), 0) * 100,
        1
    ) as enquiry_growth_rate_6m,
    
    ROUND(
        (SUM(COALESCE(revenue, 0)) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '6 months')::DECIMAL - 
         SUM(COALESCE(revenue, 0)) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '12 months' AND month_bucket < CURRENT_DATE - INTERVAL '6 months')) /
        NULLIF(SUM(COALESCE(revenue, 0)) FILTER (WHERE month_bucket >= CURRENT_DATE - INTERVAL '12 months' AND month_bucket < CURRENT_DATE - INTERVAL '6 months'), 0) * 100,
        1
    ) as revenue_growth_rate_6m,
    
    -- Resource allocation insights
    COUNT(DISTINCT month_bucket) as months_with_activity,
    AVG(enquiry_count) as avg_monthly_enquiries,
    STDDEV(enquiry_count) as enquiry_volatility,
    
    NOW() as last_updated

FROM monthly_data
GROUP BY practice_area, source
ORDER BY total_revenue DESC, total_enquiries DESC;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_practice_area_performance_unique 
ON public.mv_practice_area_performance(practice_area, source);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_mv_practice_area_performance_revenue 
ON public.mv_practice_area_performance(total_revenue DESC, overall_conversion_rate DESC);

CREATE INDEX IF NOT EXISTS idx_mv_practice_area_performance_growth 
ON public.mv_practice_area_performance(enquiry_growth_rate_6m DESC, revenue_growth_rate_6m DESC);

-- =============================================================================
-- REAL-TIME QUEUE MATERIALIZED VIEW
-- =============================================================================

-- This view updates more frequently (every minute) for real-time queue monitoring
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_real_time_queue AS
SELECT 
    -- Queue summary
    COUNT(*) FILTER (WHERE e.status = 'New') as total_new_enquiries,
    COUNT(*) FILTER (WHERE e.status = 'Assigned' AND e.responded_at IS NULL) as total_pending_responses,
    COUNT(*) FILTER (WHERE e.status = 'In Progress') as total_in_progress,
    
    -- Urgency breakdown
    COUNT(*) FILTER (WHERE e.status = 'New' AND e.urgency = 'Immediate') as immediate_new,
    COUNT(*) FILTER (WHERE e.status = 'New' AND e.urgency = 'This Week') as this_week_new,
    COUNT(*) FILTER (WHERE e.status = 'New' AND e.urgency = 'This Month') as this_month_new,
    COUNT(*) FILTER (WHERE e.status = 'New' AND e.urgency = 'Flexible') as flexible_new,
    
    -- Overdue analysis
    COUNT(*) FILTER (WHERE 
        e.status IN ('Assigned', 'In Progress') AND 
        e.responded_at IS NULL AND
        ((e.urgency = 'Immediate' AND e.received_at < NOW() - INTERVAL '2 hours') OR
         (e.urgency = 'This Week' AND e.received_at < NOW() - INTERVAL '24 hours') OR
         (e.urgency = 'This Month' AND e.received_at < NOW() - INTERVAL '72 hours'))
    ) as total_overdue,
    
    -- Value in queue
    SUM(e.estimated_value) FILTER (WHERE e.status IN ('New', 'Assigned', 'In Progress') AND e.estimated_value IS NOT NULL) as total_pipeline_value,
    
    -- Average queue age
    AVG(EXTRACT(EPOCH FROM (NOW() - e.received_at)) / 3600) FILTER (WHERE e.status = 'New') as avg_new_age_hours,
    AVG(EXTRACT(EPOCH FROM (NOW() - e.received_at)) / 3600) FILTER (WHERE e.status = 'Assigned' AND e.responded_at IS NULL) as avg_pending_age_hours,
    
    -- Practice area breakdown
    jsonb_object_agg(
        COALESCE(e.practice_area, 'Unspecified'),
        jsonb_build_object(
            'new_count', COUNT(*) FILTER (WHERE e.status = 'New' AND COALESCE(e.practice_area, 'Unspecified') = COALESCE(e.practice_area, 'Unspecified')),
            'pending_count', COUNT(*) FILTER (WHERE e.status = 'Assigned' AND e.responded_at IS NULL AND COALESCE(e.practice_area, 'Unspecified') = COALESCE(e.practice_area, 'Unspecified')),
            'total_value', SUM(e.estimated_value) FILTER (WHERE e.status IN ('New', 'Assigned', 'In Progress') AND COALESCE(e.practice_area, 'Unspecified') = COALESCE(e.practice_area, 'Unspecified') AND e.estimated_value IS NOT NULL)
        )
    ) as practice_area_breakdown,
    
    -- Clerk workload summary
    jsonb_object_agg(
        c.name,
        jsonb_build_object(
            'clerk_id', c.id,
            'current_workload', c.current_workload,
            'max_workload', c.max_workload,
            'utilization_percent', ROUND(c.current_workload::DECIMAL / NULLIF(c.max_workload, 0) * 100, 1),
            'new_assigned', COUNT(e.id) FILTER (WHERE e.status = 'New' AND e.assigned_clerk_id = c.id),
            'pending_responses', COUNT(e.id) FILTER (WHERE e.status = 'Assigned' AND e.responded_at IS NULL AND e.assigned_clerk_id = c.id)
        )
    ) FILTER (WHERE c.id IS NOT NULL) as clerk_workload_summary,
    
    -- System health indicators
    CASE 
        WHEN COUNT(*) FILTER (WHERE 
            e.status IN ('Assigned', 'In Progress') AND 
            e.responded_at IS NULL AND
            ((e.urgency = 'Immediate' AND e.received_at < NOW() - INTERVAL '2 hours') OR
             (e.urgency = 'This Week' AND e.received_at < NOW() - INTERVAL '24 hours') OR
             (e.urgency = 'This Month' AND e.received_at < NOW() - INTERVAL '72 hours'))
        ) = 0 THEN 'Green'
        WHEN COUNT(*) FILTER (WHERE 
            e.status IN ('Assigned', 'In Progress') AND 
            e.responded_at IS NULL AND
            ((e.urgency = 'Immediate' AND e.received_at < NOW() - INTERVAL '2 hours') OR
             (e.urgency = 'This Week' AND e.received_at < NOW() - INTERVAL '24 hours') OR
             (e.urgency = 'This Month' AND e.received_at < NOW() - INTERVAL '72 hours'))
        ) <= 5 THEN 'Amber'
        ELSE 'Red'
    END as system_health_status,
    
    NOW() as last_updated

FROM public.enquiries e
LEFT JOIN public.clerks c ON c.id = e.assigned_clerk_id AND c.deleted_at IS NULL
WHERE e.deleted_at IS NULL
AND e.status IN ('New', 'Assigned', 'In Progress');

-- Single row table, so no unique constraint needed
-- Performance index for frequent updates
CREATE INDEX IF NOT EXISTS idx_mv_real_time_queue_updated 
ON public.mv_real_time_queue(last_updated DESC);

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant select permissions to authenticated users
-- Access will be further controlled by RLS policies
GRANT SELECT ON public.mv_enquiry_metrics TO authenticated;
GRANT SELECT ON public.mv_barrister_performance TO authenticated;
GRANT SELECT ON public.mv_clerk_workload TO authenticated;
GRANT SELECT ON public.mv_practice_area_performance TO authenticated;
GRANT SELECT ON public.mv_real_time_queue TO authenticated;

-- =============================================================================
-- MATERIALIZED VIEW COMMENTS
-- =============================================================================

COMMENT ON MATERIALIZED VIEW public.mv_enquiry_metrics IS 'High-performance enquiry metrics aggregated by time periods and dimensions - refreshes every 5 minutes';
COMMENT ON MATERIALIZED VIEW public.mv_barrister_performance IS 'Comprehensive barrister performance metrics with rankings - refreshes every 15 minutes';
COMMENT ON MATERIALIZED VIEW public.mv_clerk_workload IS 'Real-time clerk workload and queue management data - refreshes every 2 minutes';
COMMENT ON MATERIALIZED VIEW public.mv_practice_area_performance IS 'Practice area performance with trend analysis - refreshes every 30 minutes';
COMMENT ON MATERIALIZED VIEW public.mv_real_time_queue IS 'Real-time queue status for dashboard alerts - refreshes every minute';

-- =============================================================================
-- INITIAL REFRESH
-- =============================================================================

-- Perform initial refresh of all materialized views
REFRESH MATERIALIZED VIEW public.mv_enquiry_metrics;
REFRESH MATERIALIZED VIEW public.mv_barrister_performance;
REFRESH MATERIALIZED VIEW public.mv_clerk_workload;
REFRESH MATERIALIZED VIEW public.mv_practice_area_performance;
REFRESH MATERIALIZED VIEW public.mv_real_time_queue;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
INSERT INTO _supabase_migrations (version) VALUES ('20250110000000') 
ON CONFLICT (version) DO NOTHING;