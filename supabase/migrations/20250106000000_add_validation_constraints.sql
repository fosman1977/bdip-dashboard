-- Add input validation constraints to prevent invalid data
-- This migration addresses security vulnerabilities identified in code review

-- Email validation for barristers
ALTER TABLE public.barristers 
ADD CONSTRAINT valid_email 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Email validation for clerks  
ALTER TABLE public.clerks
ADD CONSTRAINT valid_email 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Email validation for clients (optional field)
ALTER TABLE public.clients
ADD CONSTRAINT valid_email 
CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- UK phone number validation for clients (optional field)
-- Accepts formats: +44, 0044, 07123456789, +44 7123 456789, etc.
ALTER TABLE public.clients
ADD CONSTRAINT valid_phone
CHECK (
  phone IS NULL OR 
  phone ~ '^\+?44[0-9\s\-()]{10,15}$' OR
  phone ~ '^0[0-9\s\-()]{10,11}$'
);

-- UK company number validation (8 digits or 2 letters + 6 digits)
ALTER TABLE public.clients
ADD CONSTRAINT valid_company_number
CHECK (
  company_number IS NULL OR 
  company_number ~ '^[0-9]{8}$' OR 
  company_number ~ '^[A-Z]{2}[0-9]{6}$'
);

-- LEX reference format validation (LEX followed by year and sequence)
ALTER TABLE public.enquiries
ADD CONSTRAINT valid_lex_reference
CHECK (
  lex_reference IS NULL OR 
  lex_reference ~ '^LEX[0-9]{4}-[0-9]{3,6}$'
);

-- Estimated value must be positive
ALTER TABLE public.enquiries
ADD CONSTRAINT positive_estimated_value
CHECK (estimated_value IS NULL OR estimated_value > 0);

-- Response time hours must be positive
ALTER TABLE public.enquiries
ADD CONSTRAINT positive_response_time
CHECK (response_time_hours IS NULL OR response_time_hours >= 0);

-- Conversion probability must be between 0 and 1
ALTER TABLE public.enquiries
ADD CONSTRAINT valid_conversion_probability
CHECK (
  conversion_probability IS NULL OR 
  (conversion_probability >= 0 AND conversion_probability <= 1)
);

-- Engagement score must be between 0 and 100
ALTER TABLE public.barristers
ADD CONSTRAINT valid_engagement_score
CHECK (engagement_score >= 0 AND engagement_score <= 100);

-- Year of call must be reasonable (not future, not too old)
ALTER TABLE public.barristers
ADD CONSTRAINT valid_year_of_call
CHECK (
  year_of_call IS NULL OR 
  (year_of_call >= 1850 AND year_of_call <= EXTRACT(YEAR FROM NOW()) + 1)
);

-- Workload constraints
ALTER TABLE public.clerks
ADD CONSTRAINT valid_workload_bounds
CHECK (
  current_workload >= 0 AND 
  max_workload > 0 AND 
  current_workload <= max_workload
);

-- Task points must be positive
ALTER TABLE public.tasks
ADD CONSTRAINT positive_task_points
CHECK (points > 0);

-- Client total value must be non-negative
ALTER TABLE public.clients
ADD CONSTRAINT non_negative_total_value
CHECK (total_value >= 0);

-- Client matter count must be non-negative
ALTER TABLE public.clients
ADD CONSTRAINT non_negative_matter_count
CHECK (matter_count >= 0);

-- CSV import validation
ALTER TABLE public.csv_imports
ADD CONSTRAINT valid_row_counts
CHECK (
  total_rows IS NULL OR total_rows >= 0
) AND (
  processed_rows IS NULL OR processed_rows >= 0
) AND (
  error_rows IS NULL OR error_rows >= 0
) AND (
  total_rows IS NULL OR processed_rows IS NULL OR error_rows IS NULL OR
  (processed_rows + error_rows <= total_rows)
);

-- Filename validation for CSV imports (security - prevent path traversal)
ALTER TABLE public.csv_imports
ADD CONSTRAINT safe_filename
CHECK (
  filename !~ '\.\.' AND  -- No parent directory references
  filename !~ '/' AND     -- No path separators
  filename !~ '\\' AND    -- No Windows path separators
  filename ~ '\.(csv|CSV)$' -- Must end with .csv
);

-- Practice areas validation (must not be empty array)
ALTER TABLE public.barristers
ADD CONSTRAINT non_empty_practice_areas
CHECK (array_length(practice_areas, 1) > 0);

-- Name fields must not be just whitespace
ALTER TABLE public.barristers
ADD CONSTRAINT valid_barrister_name
CHECK (trim(name) != '' AND length(trim(name)) >= 2);

ALTER TABLE public.clerks
ADD CONSTRAINT valid_clerk_name
CHECK (trim(name) != '' AND length(trim(name)) >= 2);

ALTER TABLE public.clients
ADD CONSTRAINT valid_client_name
CHECK (trim(name) != '' AND length(trim(name)) >= 2);

-- Description length limits (prevent DoS via large text)
ALTER TABLE public.enquiries
ADD CONSTRAINT reasonable_description_length
CHECK (description IS NULL OR length(description) <= 10000);

ALTER TABLE public.tasks
ADD CONSTRAINT reasonable_task_description_length
CHECK (description IS NULL OR length(description) <= 5000);

-- Add comments for documentation
COMMENT ON CONSTRAINT valid_email ON public.barristers IS 'Validates email format using RFC-compliant regex';
COMMENT ON CONSTRAINT valid_lex_reference ON public.enquiries IS 'Ensures LEX reference follows standard format: LEX[YEAR]-[NUMBER]';
COMMENT ON CONSTRAINT valid_conversion_probability ON public.enquiries IS 'Conversion probability must be between 0 and 1 (0-100%)';
COMMENT ON CONSTRAINT safe_filename ON public.csv_imports IS 'Prevents path traversal attacks and ensures CSV extension';

-- Create indexes to support the new constraints (performance optimization)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_lex_reference_valid 
ON public.enquiries(lex_reference) 
WHERE lex_reference IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_company_number_valid
ON public.clients(company_number) 
WHERE company_number IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barristers_practice_areas_gin
ON public.barristers USING gin(practice_areas);

-- Log the successful constraint addition
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES (
  '20250106000000', 
  'add_validation_constraints', 
  NOW()
) ON CONFLICT (version) DO NOTHING;