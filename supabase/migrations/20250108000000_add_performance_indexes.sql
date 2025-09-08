-- Additional performance indexes based on code review recommendations
-- Migration: 20250108000000_add_performance_indexes.sql

-- Composite indexes for complex dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_client_status_received 
ON enquiries(client_id, status, received_at DESC) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_barrister_status_date 
ON enquiries(assigned_barrister_id, status, received_at DESC) 
WHERE deleted_at IS NULL AND assigned_barrister_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_clerk_workload 
ON enquiries(assigned_clerk_id, status) 
WHERE deleted_at IS NULL AND status IN ('New', 'Assigned', 'In Progress');

-- Barrister workload and availability indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barristers_workload_availability 
ON barristers(current_workload, max_workload, is_active) 
WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barristers_practice_areas_gin 
ON barristers USING GIN(practice_areas) 
WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barristers_engagement_seniority 
ON barristers(engagement_score DESC, seniority, is_active) 
WHERE deleted_at IS NULL AND is_active = true;

-- Task management indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_barrister_due_status 
ON tasks(barrister_id, due_date ASC, completed_at) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_clerk_due_status 
ON tasks(clerk_id, due_date ASC, completed_at) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_enquiry_type_status 
ON tasks(enquiry_id, type, completed_at) 
WHERE deleted_at IS NULL;

-- Client relationship and history indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_type_value 
ON clients(type, total_value DESC) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_last_instruction 
ON clients(last_instruction DESC) 
WHERE deleted_at IS NULL AND last_instruction IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_name_trgm 
ON clients USING GIN(name gin_trgm_ops) 
WHERE deleted_at IS NULL;

-- CSV import/export monitoring indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_imports_status_created 
ON csv_imports(status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_imports_type_status 
ON csv_imports(type, status, created_at DESC);

-- Audit trail indexes for compliance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiry_audit_log_enquiry_date 
ON enquiry_audit_log(enquiry_id, changed_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiry_audit_log_user_date 
ON enquiry_audit_log(changed_by, changed_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiry_audit_log_action_date 
ON enquiry_audit_log(action, changed_at DESC);

-- Revenue and conversion tracking indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_conversion_date 
ON enquiries(converted_at DESC, estimated_value DESC) 
WHERE deleted_at IS NULL AND converted_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_response_time 
ON enquiries(response_time_hours ASC, received_at DESC) 
WHERE deleted_at IS NULL AND response_time_hours IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_source_conversion 
ON enquiries(source, status, received_at DESC) 
WHERE deleted_at IS NULL;

-- Practice area performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_practice_area_stats 
ON enquiries(practice_area, status, estimated_value, received_at DESC) 
WHERE deleted_at IS NULL AND practice_area IS NOT NULL;

-- Text search indexes for better search performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_description_fts 
ON enquiries USING GIN(to_tsvector('english', COALESCE(description, ''))) 
WHERE deleted_at IS NULL AND description IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_matter_type_trgm 
ON enquiries USING GIN(matter_type gin_trgm_ops) 
WHERE deleted_at IS NULL AND matter_type IS NOT NULL;

-- Clerk workload distribution indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clerks_workload_active 
ON clerks(current_workload ASC, max_workload DESC, is_active) 
WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clerks_team_workload 
ON clerks(team, current_workload ASC) 
WHERE deleted_at IS NULL AND is_active = true;

-- Performance monitoring indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_imports_performance 
ON csv_imports(status, total_rows, processed_rows, started_at, completed_at) 
WHERE status IN ('processing', 'completed', 'failed');

-- Materialized view for dashboard performance (optional)
-- Uncomment if dashboard performance is critical

/*
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_stats AS
SELECT 
  date_trunc('day', received_at) as date,
  practice_area,
  source,
  status,
  COUNT(*) as enquiry_count,
  AVG(response_time_hours) as avg_response_time,
  SUM(estimated_value) as total_estimated_value,
  COUNT(*) FILTER (WHERE status = 'Converted') as converted_count,
  COUNT(*) FILTER (WHERE status = 'Lost') as lost_count
FROM enquiries 
WHERE deleted_at IS NULL 
  AND received_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX ON mv_dashboard_stats(date, practice_area, source, status);

-- Refresh the materialized view (should be done via scheduled job)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;
*/

-- Add comments for documentation
COMMENT ON INDEX idx_enquiries_client_status_received IS 'Optimizes client enquiry history queries';
COMMENT ON INDEX idx_barristers_workload_availability IS 'Optimizes barrister assignment algorithms';
COMMENT ON INDEX idx_tasks_barrister_due_status IS 'Optimizes task list queries for barristers';
COMMENT ON INDEX idx_clients_name_trgm IS 'Enables fuzzy search on client names';
COMMENT ON INDEX idx_enquiries_description_fts IS 'Enables full-text search on enquiry descriptions';

-- Index maintenance recommendations
-- These should be run periodically via scheduled maintenance

-- REINDEX INDEX CONCURRENTLY idx_enquiries_status;
-- ANALYZE enquiries;
-- VACUUM ANALYZE enquiries;