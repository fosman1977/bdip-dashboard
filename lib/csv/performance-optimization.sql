-- =============================================================================
-- CSV Integration Performance Optimization
-- Database indexes and constraints for high-performance CSV operations
-- =============================================================================

-- =============================================================================
-- PERFORMANCE INDEXES FOR CSV OPERATIONS
-- =============================================================================

-- Indexes for enquiries table (primary CSV import target)
-- Compound index for LEX reference lookups (most common operation)
CREATE INDEX IF NOT EXISTS idx_enquiries_lex_reference_active 
ON enquiries(lex_reference) 
WHERE lex_reference IS NOT NULL AND deleted_at IS NULL;

-- Index for client-based queries during import
CREATE INDEX IF NOT EXISTS idx_enquiries_client_status 
ON enquiries(client_id, status) 
WHERE deleted_at IS NULL;

-- Index for barrister assignment lookups
CREATE INDEX IF NOT EXISTS idx_enquiries_barrister_assignment 
ON enquiries(assigned_barrister_id, status, received_at DESC) 
WHERE deleted_at IS NULL;

-- Index for date range queries (common in exports)
CREATE INDEX IF NOT EXISTS idx_enquiries_received_date 
ON enquiries(received_at DESC) 
WHERE deleted_at IS NULL;

-- Partial index for active enquiries only (performance boost)
CREATE INDEX IF NOT EXISTS idx_enquiries_active_status 
ON enquiries(status, received_at DESC) 
WHERE status IN ('New', 'Assigned', 'In Progress') AND deleted_at IS NULL;

-- =============================================================================
-- CLIENT TABLE INDEXES (for client matching during import)
-- =============================================================================

-- Case-insensitive name search index for client matching
CREATE INDEX IF NOT EXISTS idx_clients_name_lower 
ON clients(LOWER(name), type) 
WHERE deleted_at IS NULL;

-- Email index for client deduplication
CREATE INDEX IF NOT EXISTS idx_clients_email_unique 
ON clients(LOWER(email)) 
WHERE email IS NOT NULL AND email != '' AND deleted_at IS NULL;

-- Company number index for business client matching
CREATE INDEX IF NOT EXISTS idx_clients_company_number 
ON clients(company_number) 
WHERE company_number IS NOT NULL AND company_number != '' AND deleted_at IS NULL;

-- =============================================================================
-- BARRISTER TABLE INDEXES (for fee earner matching)
-- =============================================================================

-- Case-insensitive name matching for fee earner assignment
CREATE INDEX IF NOT EXISTS idx_barristers_name_lower 
ON barristers(LOWER(name)) 
WHERE is_active = true AND deleted_at IS NULL;

-- Email index for barrister lookup
CREATE INDEX IF NOT EXISTS idx_barristers_email_active 
ON barristers(LOWER(email)) 
WHERE is_active = true AND deleted_at IS NULL;

-- Practice area index for assignment algorithms
CREATE INDEX IF NOT EXISTS idx_barristers_practice_areas 
ON barristers USING GIN(practice_areas) 
WHERE is_active = true AND deleted_at IS NULL;

-- Workload index for capacity checking
CREATE INDEX IF NOT EXISTS idx_barristers_workload 
ON barristers(current_workload, max_workload, engagement_score DESC) 
WHERE is_active = true AND deleted_at IS NULL;

-- =============================================================================
-- CSV IMPORTS TABLE INDEXES (for tracking and reporting)
-- =============================================================================

-- Status and timing indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_csv_imports_status_timing 
ON csv_imports(status, created_at DESC);

-- User tracking index (if we add user_id column)
-- CREATE INDEX IF NOT EXISTS idx_csv_imports_user_status 
-- ON csv_imports(user_id, status, created_at DESC);

-- File type and status index for analytics
CREATE INDEX IF NOT EXISTS idx_csv_imports_type_status 
ON csv_imports(type, status, completed_at DESC);

-- =============================================================================
-- FUZZY MATCHING INDEXES (for name matching)
-- =============================================================================

-- Enable fuzzy string matching extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Trigram indexes for fuzzy name matching
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm 
ON clients USING gin(name gin_trgm_ops) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_barristers_name_trgm 
ON barristers USING gin(name gin_trgm_ops) 
WHERE is_active = true AND deleted_at IS NULL;

-- =============================================================================
-- PERFORMANCE FUNCTIONS FOR CSV OPERATIONS
-- =============================================================================

-- Function to find client by fuzzy name match
CREATE OR REPLACE FUNCTION find_client_by_name(
    search_name TEXT,
    client_type TEXT DEFAULT NULL
) RETURNS TABLE(
    id UUID,
    name TEXT,
    type TEXT,
    similarity_score REAL
) 
LANGUAGE SQL STABLE
AS $$
    SELECT 
        c.id,
        c.name,
        c.type,
        similarity(c.name, search_name) as similarity_score
    FROM clients c
    WHERE 
        c.deleted_at IS NULL
        AND (client_type IS NULL OR c.type = client_type)
        AND similarity(c.name, search_name) > 0.3  -- 30% similarity threshold
    ORDER BY similarity_score DESC, c.created_at DESC
    LIMIT 5;
$$;

-- Function to find barrister by fuzzy name match
CREATE OR REPLACE FUNCTION find_barrister_by_name(
    search_name TEXT
) RETURNS TABLE(
    id UUID,
    name TEXT,
    email TEXT,
    similarity_score REAL,
    current_workload INTEGER,
    max_workload INTEGER
) 
LANGUAGE SQL STABLE
AS $$
    SELECT 
        b.id,
        b.name,
        b.email,
        similarity(b.name, search_name) as similarity_score,
        b.current_workload,
        b.max_workload
    FROM barristers b
    WHERE 
        b.is_active = true 
        AND b.deleted_at IS NULL
        AND similarity(b.name, search_name) > 0.4  -- 40% similarity threshold
    ORDER BY similarity_score DESC, b.engagement_score DESC
    LIMIT 5;
$$;

-- Function to check for duplicate LEX references efficiently
CREATE OR REPLACE FUNCTION check_lex_reference_exists(
    lex_ref TEXT
) RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
    SELECT EXISTS(
        SELECT 1 
        FROM enquiries 
        WHERE lex_reference = lex_ref 
        AND deleted_at IS NULL
    );
$$;

-- =============================================================================
-- BATCH PROCESSING OPTIMIZATIONS
-- =============================================================================

-- Function for batch client creation with conflict resolution
CREATE OR REPLACE FUNCTION batch_upsert_clients(
    client_data JSONB
) RETURNS TABLE(client_id UUID, was_created BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
    client_record RECORD;
    result_id UUID;
    was_new BOOLEAN;
BEGIN
    FOR client_record IN 
        SELECT * FROM jsonb_to_recordset(client_data) AS x(
            name TEXT,
            type TEXT,
            email TEXT,
            phone TEXT,
            company_number TEXT
        )
    LOOP
        -- Try to find existing client
        SELECT id INTO result_id
        FROM clients
        WHERE 
            LOWER(name) = LOWER(client_record.name)
            AND type = client_record.type
            AND deleted_at IS NULL
        LIMIT 1;
        
        IF result_id IS NULL THEN
            -- Create new client
            INSERT INTO clients (name, type, email, phone, company_number, total_value, matter_count)
            VALUES (
                client_record.name,
                client_record.type,
                NULLIF(client_record.email, ''),
                NULLIF(client_record.phone, ''),
                NULLIF(client_record.company_number, ''),
                0,
                0
            )
            RETURNING id INTO result_id;
            was_new := true;
        ELSE
            -- Update existing client if new info provided
            UPDATE clients SET
                email = COALESCE(NULLIF(client_record.email, ''), email),
                phone = COALESCE(NULLIF(client_record.phone, ''), phone),
                company_number = COALESCE(NULLIF(client_record.company_number, ''), company_number),
                updated_at = NOW()
            WHERE id = result_id;
            was_new := false;
        END IF;
        
        RETURN QUERY SELECT result_id, was_new;
    END LOOP;
END;
$$;

-- =============================================================================
-- PARTITIONING FOR LARGE DATASETS
-- =============================================================================

-- Create partitioned table for CSV import logs (if volume is high)
-- This is optional and only needed for very high volume installations

-- CREATE TABLE csv_imports_partitioned (
--     LIKE csv_imports INCLUDING ALL
-- ) PARTITION BY RANGE (created_at);

-- -- Create monthly partitions
-- CREATE TABLE csv_imports_2025_01 PARTITION OF csv_imports_partitioned
--     FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- CREATE TABLE csv_imports_2025_02 PARTITION OF csv_imports_partitioned
--     FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- =============================================================================
-- VACUUM AND MAINTENANCE JOBS
-- =============================================================================

-- Auto-vacuum settings for high-write tables
ALTER TABLE csv_imports SET (
    autovacuum_vacuum_threshold = 100,
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_threshold = 50,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE enquiries SET (
    autovacuum_vacuum_threshold = 500,
    autovacuum_vacuum_scale_factor = 0.1
);

-- =============================================================================
-- QUERY OPTIMIZATION VIEWS
-- =============================================================================

-- Materialized view for CSV import statistics (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS csv_import_stats AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    type,
    status,
    COUNT(*) as import_count,
    AVG(total_rows) as avg_rows,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
FROM csv_imports
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), type, status
ORDER BY hour DESC;

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_csv_import_stats_unique
ON csv_import_stats(hour, type, status);

-- =============================================================================
-- CONSTRAINT OPTIMIZATIONS
-- =============================================================================

-- Add constraints that help with query planning
ALTER TABLE enquiries 
ADD CONSTRAINT chk_enquiries_estimated_value_positive 
CHECK (estimated_value IS NULL OR estimated_value >= 0);

ALTER TABLE clients 
ADD CONSTRAINT chk_clients_total_value_positive 
CHECK (total_value >= 0);

ALTER TABLE barristers 
ADD CONSTRAINT chk_barristers_workload_valid 
CHECK (current_workload >= 0 AND current_workload <= max_workload);

-- =============================================================================
-- PERFORMANCE MONITORING QUERIES
-- =============================================================================

-- View to monitor CSV import performance
CREATE OR REPLACE VIEW csv_performance_monitor AS
SELECT 
    ci.id,
    ci.filename,
    ci.type,
    ci.status,
    ci.total_rows,
    ci.processed_rows,
    ci.error_rows,
    CASE 
        WHEN ci.total_rows > 0 THEN 
            ROUND((ci.processed_rows::DECIMAL / ci.total_rows * 100), 2)
        ELSE 0 
    END as progress_percent,
    EXTRACT(EPOCH FROM (ci.completed_at - ci.started_at)) as duration_seconds,
    CASE 
        WHEN ci.started_at IS NOT NULL AND ci.processed_rows > 0 THEN
            ROUND(
                EXTRACT(EPOCH FROM (COALESCE(ci.completed_at, NOW()) - ci.started_at)) / 
                NULLIF(ci.processed_rows, 0), 
                4
            )
        ELSE NULL 
    END as seconds_per_row,
    ci.created_at,
    ci.started_at,
    ci.completed_at
FROM csv_imports ci
WHERE ci.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY ci.created_at DESC;

-- =============================================================================
-- CLEANUP AND MAINTENANCE FUNCTIONS
-- =============================================================================

-- Function to clean up old CSV import records
CREATE OR REPLACE FUNCTION cleanup_old_csv_imports(
    retention_days INTEGER DEFAULT 30
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM csv_imports 
    WHERE 
        created_at < NOW() - (retention_days || ' days')::INTERVAL
        AND status IN ('completed', 'failed');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Refresh materialized view after cleanup
    REFRESH MATERIALIZED VIEW CONCURRENTLY csv_import_stats;
    
    RETURN deleted_count;
END;
$$;

-- =============================================================================
-- TRANSACTION SAFETY FUNCTIONS
-- =============================================================================

-- Function to safely begin/commit/rollback transactions
CREATE OR REPLACE FUNCTION begin_transaction() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- This is a placeholder - actual transaction handling 
    -- should be done at the application level
    RAISE NOTICE 'Transaction started';
END;
$$;

CREATE OR REPLACE FUNCTION commit_transaction() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE NOTICE 'Transaction committed';
END;
$$;

CREATE OR REPLACE FUNCTION rollback_transaction() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE NOTICE 'Transaction rolled back';
END;
$$;

-- =============================================================================
-- PERFORMANCE TIPS AND CONFIGURATION
-- =============================================================================

/*
For optimal performance, ensure these PostgreSQL settings:

1. Connection pooling:
   - max_connections = 200
   - shared_buffers = 25% of RAM
   - effective_cache_size = 75% of RAM

2. Write performance:
   - wal_buffers = 16MB
   - checkpoint_timeout = 10min
   - checkpoint_completion_target = 0.9

3. Query performance:
   - random_page_cost = 1.1 (for SSD)
   - effective_io_concurrency = 4

4. Maintenance:
   - Schedule VACUUM ANALYZE during low-traffic periods
   - Monitor index usage with pg_stat_user_indexes
   - Consider partitioning for very large datasets

5. CSV-specific optimizations:
   - Use COPY instead of INSERT for bulk operations
   - Process in batches of 500-1000 rows
   - Use prepared statements for repetitive queries
   - Enable parallel processing for large imports
*/