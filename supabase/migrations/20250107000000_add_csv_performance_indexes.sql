-- Add performance indexes for CSV import/export operations
-- This migration addresses performance concerns identified in code review

-- Critical indexes for CSV import performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_imports_processing 
ON public.csv_imports(status, type, created_at) 
WHERE status IN ('pending', 'processing');

-- Index for monitoring active imports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_imports_active_status
ON public.csv_imports(created_at DESC, status) 
WHERE status != 'completed';

-- Optimize bulk operations on enquiries during CSV imports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_lex_ref_status 
ON public.enquiries(lex_reference, status) 
WHERE lex_reference IS NOT NULL;

-- Index for finding enquiries by LEX reference during updates
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_lex_reference_lookup
ON public.enquiries(lex_reference)
WHERE lex_reference IS NOT NULL AND deleted_at IS NULL;

-- Client lookup optimization for CSV imports (fuzzy matching support)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_name_type 
ON public.clients(name, type) 
WHERE deleted_at IS NULL;

-- Additional client lookup by company number
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_company_lookup
ON public.clients(company_number, type)
WHERE company_number IS NOT NULL AND deleted_at IS NULL;

-- Barrister lookup by name for CSV fee earner matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barristers_name_active
ON public.barristers(name)
WHERE is_active = true AND deleted_at IS NULL;

-- Support partial name matching for barristers
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barristers_name_trgm
ON public.barristers USING gin(name gin_trgm_ops)
WHERE is_active = true;

-- Clerk assignment optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clerks_workload_active
ON public.clerks(current_workload, max_workload)
WHERE deleted_at IS NULL;

-- Dashboard query optimization (frequently accessed data)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_status_received
ON public.enquiries(status, received_at DESC)
WHERE deleted_at IS NULL;

-- Conversion tracking for reports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_conversion_tracking
ON public.enquiries(status, converted_at, estimated_value)
WHERE status IN ('Converted', 'Lost') AND deleted_at IS NULL;

-- Performance tracking for barristers
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_barrister_performance
ON public.enquiries(assigned_barrister_id, status, converted_at)
WHERE assigned_barrister_id IS NOT NULL AND deleted_at IS NULL;

-- Task completion tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_completion
ON public.tasks(barrister_id, completed_at, points)
WHERE completed_at IS NOT NULL AND deleted_at IS NULL;

-- Audit log performance (for compliance queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_time
ON public.audit_logs(entity_type, entity_id, changed_at DESC);

-- Date-based partitioning support for enquiries (future scalability)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_received_date
ON public.enquiries(DATE(received_at), status)
WHERE deleted_at IS NULL;

-- Time-series optimization for analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_monthly_stats
ON public.enquiries(
  DATE_TRUNC('month', received_at), 
  status, 
  practice_area
) WHERE deleted_at IS NULL;

-- Support for real-time dashboard updates
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_recent_activity
ON public.enquiries(updated_at DESC)
WHERE deleted_at IS NULL;

-- Client relationship tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_client_history
ON public.enquiries(client_id, received_at DESC)
WHERE client_id IS NOT NULL AND deleted_at IS NULL;

-- Practice area performance analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_practice_area_stats
ON public.enquiries(practice_area, status, estimated_value)
WHERE practice_area IS NOT NULL AND deleted_at IS NULL;

-- Workload balancing queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_clerk_assignment
ON public.enquiries(assigned_clerk_id, status, received_at)
WHERE assigned_clerk_id IS NOT NULL AND deleted_at IS NULL;

-- Response time analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_response_time
ON public.enquiries(response_time_hours, urgency)
WHERE response_time_hours IS NOT NULL AND deleted_at IS NULL;

-- Enable pg_trgm extension for fuzzy text matching (if not already enabled)
-- This supports name matching during CSV imports
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Function-based index for case-insensitive client name lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_name_lower
ON public.clients(LOWER(name))
WHERE deleted_at IS NULL;

-- Function-based index for case-insensitive barrister name lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barristers_name_lower
ON public.barristers(LOWER(name))
WHERE is_active = true AND deleted_at IS NULL;

-- Composite index for CSV export queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_export_data
ON public.enquiries(
  lex_reference, 
  status, 
  assigned_barrister_id, 
  responded_at
) WHERE lex_reference IS NOT NULL AND deleted_at IS NULL;

-- Index to support CSV import status tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_imports_filename_type
ON public.csv_imports(filename, type, started_at DESC);

-- Partial index for failed imports (for retry logic)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_imports_failed
ON public.csv_imports(created_at DESC, error_rows)
WHERE status = 'failed' AND error_rows > 0;

-- Statistics refresh for query planner optimization
-- This should be run after bulk data loads
CREATE OR REPLACE FUNCTION refresh_csv_import_stats() 
RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh statistics for tables involved in CSV operations
  ANALYZE public.enquiries;
  ANALYZE public.clients;
  ANALYZE public.barristers;
  ANALYZE public.csv_imports;
  
  -- Log the refresh
  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    changed_by,
    changed_at,
    changes
  ) VALUES (
    'system',
    'csv_import_stats',
    'refresh_statistics',
    'system',
    NOW(),
    '{"action": "refreshed table statistics for CSV operations"}'::jsonb
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION refresh_csv_import_stats() TO authenticated;

-- Add helpful comments for maintenance
COMMENT ON INDEX idx_csv_imports_processing IS 'Optimizes queries for active CSV import monitoring';
COMMENT ON INDEX idx_enquiries_lex_ref_status IS 'Critical for CSV import/export performance with LEX system';
COMMENT ON INDEX idx_clients_name_trgm IS 'Enables fuzzy matching for client names during CSV import';
COMMENT ON FUNCTION refresh_csv_import_stats IS 'Refreshes table statistics after bulk CSV operations';

-- Log the successful index creation
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES (
  '20250107000000', 
  'add_csv_performance_indexes', 
  NOW()
) ON CONFLICT (version) DO NOTHING;