-- =============================================================================
-- BDIP Database Triggers
-- Version: 20250104000000_create_triggers.sql
-- Purpose: Automatic updates, audit trails, and business rule enforcement
-- =============================================================================

-- =============================================================================
-- UTILITY FUNCTIONS FOR TRIGGERS
-- =============================================================================

-- Generic function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to capture audit trail data
CREATE OR REPLACE FUNCTION public.create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  changed_fields TEXT[] := '{}';
  old_vals JSONB := '{}'::jsonb;
  new_vals JSONB := '{}'::jsonb;
  field_name TEXT;
BEGIN
  -- Only process UPDATE operations for now
  IF TG_OP = 'UPDATE' THEN
    -- Compare OLD and NEW to find changed fields
    FOR field_name IN 
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = TG_TABLE_SCHEMA 
      AND table_name = TG_TABLE_NAME
      AND column_name NOT IN ('updated_at', 'created_at') -- Skip timestamp fields
    LOOP
      -- Use dynamic SQL to compare fields
      IF (to_jsonb(OLD) ->> field_name) IS DISTINCT FROM (to_jsonb(NEW) ->> field_name) THEN
        changed_fields := changed_fields || field_name;
        old_vals := old_vals || jsonb_build_object(field_name, to_jsonb(OLD) ->> field_name);
        new_vals := new_vals || jsonb_build_object(field_name, to_jsonb(NEW) ->> field_name);
      END IF;
    END LOOP;
    
    -- Only create audit log if fields actually changed
    IF array_length(changed_fields, 1) > 0 THEN
      INSERT INTO public.enquiry_audit_log (
        enquiry_id,
        operation_type,
        changed_fields,
        old_values,
        new_values,
        user_id,
        user_role,
        created_at
      ) VALUES (
        NEW.id,
        'UPDATE',
        array_to_json(changed_fields)::jsonb,
        old_vals,
        new_vals,
        auth.uid(),
        (SELECT role FROM public.profiles WHERE id = auth.uid()),
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Create updated_at triggers for all main tables
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_barristers_updated_at 
  BEFORE UPDATE ON public.barristers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_clerks_updated_at 
  BEFORE UPDATE ON public.clerks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_clients_updated_at 
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_enquiries_updated_at 
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_tasks_updated_at 
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- BUSINESS LOGIC TRIGGERS
-- =============================================================================

-- Calculate response time when enquiry is responded to
CREATE OR REPLACE FUNCTION public.calculate_response_time()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate if responded_at is being set for the first time
  IF OLD.responded_at IS NULL AND NEW.responded_at IS NOT NULL THEN
    NEW.response_time_hours := EXTRACT(EPOCH FROM (NEW.responded_at - NEW.received_at)) / 3600;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_enquiry_response_time 
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.calculate_response_time();

-- Update conversion probability when key enquiry fields change
CREATE OR REPLACE FUNCTION public.update_conversion_probability_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate conversion probability if relevant fields changed
  IF (OLD.response_time_hours IS DISTINCT FROM NEW.response_time_hours) OR
     (OLD.estimated_value IS DISTINCT FROM NEW.estimated_value) OR
     (OLD.source IS DISTINCT FROM NEW.source) OR
     (OLD.urgency IS DISTINCT FROM NEW.urgency) OR
     (OLD.client_id IS DISTINCT FROM NEW.client_id) THEN
    
    NEW.conversion_probability := public.calculate_conversion_probability(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversion_probability 
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_conversion_probability_trigger();

-- Update client statistics when enquiry status changes
CREATE OR REPLACE FUNCTION public.update_client_stats()
RETURNS TRIGGER AS $$
DECLARE
  client_uuid UUID;
BEGIN
  -- Get client ID (handle both OLD and NEW)
  client_uuid := COALESCE(NEW.client_id, OLD.client_id);
  
  IF client_uuid IS NOT NULL THEN
    -- Update client matter count and value
    UPDATE public.clients 
    SET 
      matter_count = (
        SELECT COUNT(*) 
        FROM public.enquiries 
        WHERE client_id = client_uuid 
        AND status = 'Converted'
        AND deleted_at IS NULL
      ),
      total_value = (
        SELECT COALESCE(SUM(actual_value), 0) 
        FROM public.enquiries 
        WHERE client_id = client_uuid 
        AND status = 'Converted'
        AND actual_value IS NOT NULL
        AND deleted_at IS NULL
      ),
      last_instruction = (
        SELECT MAX(converted_at::DATE)
        FROM public.enquiries 
        WHERE client_id = client_uuid 
        AND status = 'Converted'
        AND deleted_at IS NULL
      ),
      updated_at = NOW()
    WHERE id = client_uuid;
    
    -- Set first instruction date if this is the first conversion
    UPDATE public.clients 
    SET first_instruction = (
      SELECT MIN(converted_at::DATE)
      FROM public.enquiries 
      WHERE client_id = client_uuid 
      AND status = 'Converted'
      AND deleted_at IS NULL
    )
    WHERE id = client_uuid 
    AND first_instruction IS NULL;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_statistics 
  AFTER INSERT OR UPDATE OR DELETE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_client_stats();

-- Update workloads when enquiries are assigned or status changes
CREATE OR REPLACE FUNCTION public.update_workloads_on_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle assignment changes
  IF TG_OP = 'UPDATE' THEN
    -- Update old barrister's workload if assignment changed
    IF OLD.assigned_barrister_id IS DISTINCT FROM NEW.assigned_barrister_id THEN
      IF OLD.assigned_barrister_id IS NOT NULL THEN
        PERFORM public.update_barrister_workload(OLD.assigned_barrister_id);
      END IF;
      IF NEW.assigned_barrister_id IS NOT NULL THEN
        PERFORM public.update_barrister_workload(NEW.assigned_barrister_id);
      END IF;
    END IF;
    
    -- Update old clerk's workload if assignment changed
    IF OLD.assigned_clerk_id IS DISTINCT FROM NEW.assigned_clerk_id THEN
      IF OLD.assigned_clerk_id IS NOT NULL THEN
        PERFORM public.update_clerk_workload(OLD.assigned_clerk_id);
      END IF;
      IF NEW.assigned_clerk_id IS NOT NULL THEN
        PERFORM public.update_clerk_workload(NEW.assigned_clerk_id);
      END IF;
    END IF;
    
    -- Update workloads if status changed to/from active states
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.assigned_barrister_id IS NOT NULL THEN
        PERFORM public.update_barrister_workload(NEW.assigned_barrister_id);
      END IF;
      IF NEW.assigned_clerk_id IS NOT NULL THEN
        PERFORM public.update_clerk_workload(NEW.assigned_clerk_id);
      END IF;
    END IF;
  END IF;
  
  -- Handle new assignments
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_barrister_id IS NOT NULL THEN
      PERFORM public.update_barrister_workload(NEW.assigned_barrister_id);
    END IF;
    IF NEW.assigned_clerk_id IS NOT NULL THEN
      PERFORM public.update_clerk_workload(NEW.assigned_clerk_id);
    END IF;
  END IF;
  
  -- Handle deletions
  IF TG_OP = 'DELETE' THEN
    IF OLD.assigned_barrister_id IS NOT NULL THEN
      PERFORM public.update_barrister_workload(OLD.assigned_barrister_id);
    END IF;
    IF OLD.assigned_clerk_id IS NOT NULL THEN
      PERFORM public.update_clerk_workload(OLD.assigned_clerk_id);
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workloads_on_enquiry_change 
  AFTER INSERT OR UPDATE OR DELETE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_workloads_on_assignment();

-- Update workloads when tasks are created/completed
CREATE OR REPLACE FUNCTION public.update_workloads_on_task_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    -- Update barrister workload if task is assigned to one
    IF NEW.barrister_id IS NOT NULL THEN
      PERFORM public.update_barrister_workload(NEW.barrister_id);
    END IF;
    
    -- Handle reassignment
    IF TG_OP = 'UPDATE' AND OLD.barrister_id IS DISTINCT FROM NEW.barrister_id THEN
      IF OLD.barrister_id IS NOT NULL THEN
        PERFORM public.update_barrister_workload(OLD.barrister_id);
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    IF OLD.barrister_id IS NOT NULL THEN
      PERFORM public.update_barrister_workload(OLD.barrister_id);
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workloads_on_task_change 
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_workloads_on_task_change();

-- =============================================================================
-- AUDIT TRAIL TRIGGERS
-- =============================================================================

-- Audit trail for enquiry changes
CREATE TRIGGER enquiry_audit_trail 
  AFTER UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.create_audit_log();

-- Assignment audit trail - track all assignment changes
CREATE OR REPLACE FUNCTION public.log_assignment_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log assignment changes
  IF TG_OP = 'UPDATE' THEN
    -- Check if clerk assignment changed
    IF OLD.assigned_clerk_id IS DISTINCT FROM NEW.assigned_clerk_id THEN
      INSERT INTO public.assignment_audit_log (
        enquiry_id,
        from_clerk_id,
        to_clerk_id,
        assignment_reason,
        automatic_assignment,
        assigned_by,
        created_at
      ) VALUES (
        NEW.id,
        OLD.assigned_clerk_id,
        NEW.assigned_clerk_id,
        CASE 
          WHEN NEW.assigned_clerk_id IS NULL THEN 'Unassigned'
          WHEN OLD.assigned_clerk_id IS NULL THEN 'Initial Assignment'
          ELSE 'Reassignment'
        END,
        false, -- Manual assignment (would need to track this in application)
        auth.uid(),
        NOW()
      );
    END IF;
    
    -- Check if barrister assignment changed
    IF OLD.assigned_barrister_id IS DISTINCT FROM NEW.assigned_barrister_id THEN
      INSERT INTO public.assignment_audit_log (
        enquiry_id,
        from_barrister_id,
        to_barrister_id,
        assignment_reason,
        automatic_assignment,
        assigned_by,
        created_at
      ) VALUES (
        NEW.id,
        OLD.assigned_barrister_id,
        NEW.assigned_barrister_id,
        CASE 
          WHEN NEW.assigned_barrister_id IS NULL THEN 'Unassigned'
          WHEN OLD.assigned_barrister_id IS NULL THEN 'Initial Assignment'
          ELSE 'Reassignment'
        END,
        false, -- Manual assignment
        auth.uid(),
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_enquiry_assignments 
  AFTER UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.log_assignment_changes();

-- =============================================================================
-- DATA VALIDATION TRIGGERS
-- =============================================================================

-- Validate practice areas against a standard list
CREATE OR REPLACE FUNCTION public.validate_practice_areas()
RETURNS TRIGGER AS $$
DECLARE
  valid_areas TEXT[] := ARRAY[
    'Commercial', 'Employment', 'Clinical Negligence', 'Personal Injury',
    'Criminal', 'Family', 'Immigration', 'Property', 'Planning',
    'Administrative & Public', 'Professional Discipline', 'Regulatory',
    'Tax', 'Chancery', 'Construction', 'Insurance', 'Data Protection'
  ];
  area TEXT;
BEGIN
  -- Validate each practice area in the array
  IF NEW.practice_areas IS NOT NULL THEN
    FOREACH area IN ARRAY NEW.practice_areas LOOP
      IF NOT (area = ANY(valid_areas)) THEN
        RAISE EXCEPTION 'Invalid practice area: %. Valid areas are: %', 
          area, array_to_string(valid_areas, ', ');
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_barrister_practice_areas 
  BEFORE INSERT OR UPDATE ON public.barristers
  FOR EACH ROW EXECUTE FUNCTION public.validate_practice_areas();

-- Validate enquiry practice area
CREATE OR REPLACE FUNCTION public.validate_enquiry_practice_area()
RETURNS TRIGGER AS $$
DECLARE
  valid_areas TEXT[] := ARRAY[
    'Commercial', 'Employment', 'Clinical Negligence', 'Personal Injury',
    'Criminal', 'Family', 'Immigration', 'Property', 'Planning',
    'Administrative & Public', 'Professional Discipline', 'Regulatory',
    'Tax', 'Chancery', 'Construction', 'Insurance', 'Data Protection'
  ];
BEGIN
  IF NEW.practice_area IS NOT NULL AND NOT (NEW.practice_area = ANY(valid_areas)) THEN
    RAISE EXCEPTION 'Invalid practice area: %. Valid areas are: %', 
      NEW.practice_area, array_to_string(valid_areas, ', ');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_enquiry_practice_area 
  BEFORE INSERT OR UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.validate_enquiry_practice_area();

-- Prevent deletion of active enquiries (soft delete only)
CREATE OR REPLACE FUNCTION public.prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion not allowed. Use soft delete by setting deleted_at timestamp.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_enquiry_hard_delete 
  BEFORE DELETE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

CREATE TRIGGER prevent_client_hard_delete 
  BEFORE DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

CREATE TRIGGER prevent_barrister_hard_delete 
  BEFORE DELETE ON public.barristers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

CREATE TRIGGER prevent_clerk_hard_delete 
  BEFORE DELETE ON public.clerks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- =============================================================================
-- PERFORMANCE OPTIMIZATION TRIGGERS
-- =============================================================================

-- Automatically update engagement scores when significant changes occur
CREATE OR REPLACE FUNCTION public.trigger_engagement_score_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Queue engagement score update for affected barrister
  -- This would typically be handled by a background job to avoid blocking
  -- For now, we'll update directly but this could be optimized
  
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'enquiries' THEN
    -- Update when conversion status changes or response time is set
    IF (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Converted', 'Lost')) OR
       (OLD.responded_at IS NULL AND NEW.responded_at IS NOT NULL) THEN
      
      -- Update the assigned barrister's score
      IF NEW.assigned_barrister_id IS NOT NULL THEN
        -- Use a deferred update to avoid recursion
        UPDATE public.barristers 
        SET engagement_score = public.calculate_engagement_score(NEW.assigned_barrister_id)
        WHERE id = NEW.assigned_barrister_id;
      END IF;
    END IF;
  END IF;
  
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'tasks' THEN
    -- Update when task is completed with quality score
    IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND NEW.quality_score IS NOT NULL THEN
      IF NEW.barrister_id IS NOT NULL THEN
        UPDATE public.barristers 
        SET engagement_score = public.calculate_engagement_score(NEW.barrister_id)
        WHERE id = NEW.barrister_id;
      END IF;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_barrister_score_update_on_enquiry 
  AFTER UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.trigger_engagement_score_update();

CREATE TRIGGER trigger_barrister_score_update_on_task 
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.trigger_engagement_score_update();

-- =============================================================================
-- CSV IMPORT TRIGGERS
-- =============================================================================

-- Update CSV import progress
CREATE OR REPLACE FUNCTION public.update_csv_import_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate percentages and update status
  IF NEW.total_rows IS NOT NULL AND NEW.total_rows > 0 THEN
    -- Update processed percentage
    IF NEW.status = 'processing' AND NEW.processed_rows IS NOT NULL THEN
      -- Auto-complete when all rows processed
      IF NEW.processed_rows >= NEW.total_rows THEN
        NEW.status := 'completed';
        NEW.completed_at := NOW();
      END IF;
    END IF;
    
    -- Calculate duration if completed
    IF NEW.status = 'completed' AND NEW.started_at IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
      NEW.processing_duration_ms := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_csv_import_status 
  BEFORE UPDATE ON public.csv_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_csv_import_progress();

-- =============================================================================
-- TRIGGER SECURITY AND PERMISSIONS
-- =============================================================================

-- Ensure triggers can run with appropriate permissions
-- Most trigger functions run as SECURITY DEFINER to bypass RLS when needed

-- =============================================================================
-- TRIGGERS COMPLETE
-- =============================================================================

-- Log migration completion
INSERT INTO _supabase_migrations (version) VALUES ('20250104000000') 
ON CONFLICT (version) DO NOTHING;