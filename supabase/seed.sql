-- =============================================================================
-- BDIP Comprehensive Seed Data
-- Purpose: Realistic test data for development and demonstration
-- Note: Run this after all migrations are applied
-- =============================================================================

-- =============================================================================
-- PRACTICE AREAS LOOKUP DATA
-- =============================================================================

-- Standard practice areas for validation
DO $$
DECLARE
  practice_areas TEXT[] := ARRAY[
    'Commercial', 'Employment', 'Clinical Negligence', 'Personal Injury',
    'Criminal', 'Family', 'Immigration', 'Property', 'Planning',
    'Administrative & Public', 'Professional Discipline', 'Regulatory',
    'Tax', 'Chancery', 'Construction', 'Insurance', 'Data Protection'
  ];
BEGIN
  -- Practice areas are validated by triggers, no separate table needed
  -- This block serves as documentation of valid practice areas
END $$;

-- =============================================================================
-- USER PROFILES AND AUTHENTICATION
-- =============================================================================

-- Insert sample profiles (these would typically be created via Supabase Auth)
-- For demo purposes, we'll create profiles directly
INSERT INTO public.profiles (id, email, full_name, role, is_active) VALUES
-- Administrators
('11111111-1111-1111-1111-111111111111', 'admin@chambers.co.uk', 'Sarah Matthews', 'admin', true),
('22222222-2222-2222-2222-222222222222', 'head.clerk@chambers.co.uk', 'Michael Thompson', 'clerk', true),

-- Senior Clerks
('33333333-3333-3333-3333-333333333333', 'senior.clerk1@chambers.co.uk', 'Emma Richardson', 'clerk', true),
('44444444-4444-4444-4444-444444444444', 'senior.clerk2@chambers.co.uk', 'David Wilson', 'clerk', true),

-- Junior Clerks
('55555555-5555-5555-5555-555555555555', 'clerk1@chambers.co.uk', 'James Carter', 'clerk', true),
('66666666-6666-6666-6666-666666666666', 'clerk2@chambers.co.uk', 'Sophie Turner', 'clerk', true),

-- Barristers - KCs
('77777777-7777-7777-7777-777777777777', 'j.smith@chambers.co.uk', 'John Smith KC', 'barrister', true),
('88888888-8888-8888-8888-888888888888', 'a.jones@chambers.co.uk', 'Amanda Jones KC', 'barrister', true),

-- Barristers - Senior
('99999999-9999-9999-9999-999999999999', 'r.williams@chambers.co.uk', 'Robert Williams', 'barrister', true),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'm.brown@chambers.co.uk', 'Margaret Brown', 'barrister', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p.davis@chambers.co.uk', 'Peter Davis', 'barrister', true),

-- Barristers - Middle
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'l.taylor@chambers.co.uk', 'Louise Taylor', 'barrister', true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 's.johnson@chambers.co.uk', 'Steven Johnson', 'barrister', true),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'k.white@chambers.co.uk', 'Katherine White', 'barrister', true),

-- Barristers - Junior
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'a.green@chambers.co.uk', 'Andrew Green', 'barrister', true),
('gggggggg-gggg-gggg-gggg-gggggggggggg', 'j.hall@chambers.co.uk', 'Jennifer Hall', 'barrister', true),

-- Barristers - Pupils
('hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', 'pupil1@chambers.co.uk', 'Thomas Clark', 'barrister', true),
('iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', 'pupil2@chambers.co.uk', 'Rachel Adams', 'barrister', true)

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- CLERKS DATA
-- =============================================================================

INSERT INTO public.clerks (id, profile_id, name, email, team, is_senior, max_workload, current_workload, phone) VALUES
('c1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Michael Thompson', 'head.clerk@chambers.co.uk', 'Commercial', true, 30, 8, '020 7123 4567'),
('c2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Emma Richardson', 'senior.clerk1@chambers.co.uk', 'Commercial', true, 25, 12, '020 7123 4568'),
('c3333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'David Wilson', 'senior.clerk2@chambers.co.uk', 'Employment', true, 25, 10, '020 7123 4569'),
('c4444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'James Carter', 'clerk1@chambers.co.uk', 'General', false, 20, 15, '020 7123 4570'),
('c5555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 'Sophie Turner', 'clerk2@chambers.co.uk', 'Clinical Negligence', false, 20, 8, '020 7123 4571');

-- =============================================================================
-- BARRISTERS DATA
-- =============================================================================

INSERT INTO public.barristers (id, profile_id, name, email, year_of_call, practice_areas, seniority, engagement_score, current_workload, max_workload, phone) VALUES
-- KCs
('b1111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'John Smith KC', 'j.smith@chambers.co.uk', 1995, 
 ARRAY['Commercial', 'Construction', 'Insurance'], 'KC', 92.5, 5, 8, '020 7123 5001'),
('b2222222-2222-2222-2222-222222222222', '88888888-8888-8888-8888-888888888888', 'Amanda Jones KC', 'a.jones@chambers.co.uk', 1998, 
 ARRAY['Employment', 'Professional Discipline', 'Administrative & Public'], 'KC', 89.3, 6, 8, '020 7123 5002'),

-- Senior Barristers  
('b3333333-3333-3333-3333-333333333333', '99999999-9999-9999-9999-999999999999', 'Robert Williams', 'r.williams@chambers.co.uk', 2005, 
 ARRAY['Clinical Negligence', 'Personal Injury', 'Professional Discipline'], 'Senior', 85.7, 8, 12, '020 7123 5003'),
('b4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Margaret Brown', 'm.brown@chambers.co.uk', 2008, 
 ARRAY['Family', 'Immigration', 'Administrative & Public'], 'Senior', 82.1, 7, 12, '020 7123 5004'),
('b5555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Peter Davis', 'p.davis@chambers.co.uk', 2010, 
 ARRAY['Commercial', 'Tax', 'Regulatory'], 'Senior', 88.4, 9, 12, '020 7123 5005'),

-- Middle Barristers
('b6666666-6666-6666-6666-666666666666', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Louise Taylor', 'l.taylor@chambers.co.uk', 2015, 
 ARRAY['Employment', 'Professional Discipline', 'Data Protection'], 'Middle', 79.6, 10, 15, '020 7123 5006'),
('b7777777-7777-7777-7777-777777777777', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Steven Johnson', 's.johnson@chambers.co.uk', 2016, 
 ARRAY['Clinical Negligence', 'Personal Injury'], 'Middle', 76.8, 12, 15, '020 7123 5007'),
('b8888888-8888-8888-8888-888888888888', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Katherine White', 'k.white@chambers.co.uk', 2017, 
 ARRAY['Property', 'Planning', 'Construction'], 'Middle', 81.2, 8, 15, '020 7123 5008'),

-- Junior Barristers
('b9999999-9999-9999-9999-999999999999', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Andrew Green', 'a.green@chambers.co.uk', 2020, 
 ARRAY['Criminal', 'Family', 'Immigration'], 'Junior', 72.3, 14, 18, '020 7123 5009'),
('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gggggggg-gggg-gggg-gggg-gggggggggggg', 'Jennifer Hall', 'j.hall@chambers.co.uk', 2021, 
 ARRAY['Employment', 'Commercial', 'Data Protection'], 'Junior', 74.9, 11, 18, '020 7123 5010'),

-- Pupils
('bbbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', 'Thomas Clark', 'pupil1@chambers.co.uk', 2023, 
 ARRAY['Commercial', 'Employment'], 'Pupil', 65.0, 6, 12, '020 7123 5011'),
('bccccccc-cccc-cccc-cccc-cccccccccccc', 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', 'Rachel Adams', 'pupil2@chambers.co.uk', 2024, 
 ARRAY['Clinical Negligence', 'Personal Injury'], 'Pupil', 68.2, 4, 12, '020 7123 5012');

-- =============================================================================
-- CLIENTS DATA
-- =============================================================================

INSERT INTO public.clients (id, name, type, email, phone, company_number, address_line_1, city, postcode, total_value, matter_count, first_instruction, last_instruction, marketing_consent, tags) VALUES
-- Major Corporate Clients
('cl111111-1111-1111-1111-111111111111', 'GlobalTech Solutions Ltd', 'Company', 'legal@globaltech.co.uk', '020 7234 5678', '12345678', 
 'Tech Tower, 123 Innovation Street', 'London', 'EC2A 1AA', 2450000.00, 15, '2020-03-15', '2024-11-20', true, ARRAY['Technology', 'Major Client', 'Retainer']),

('cl222222-2222-2222-2222-222222222222', 'Metropolitan Construction Group', 'Company', 'contracts@metroconstruct.com', '020 7345 6789', '23456789', 
 'Build House, 45 Construction Way', 'London', 'SW1A 2BB', 1850000.00, 22, '2019-08-10', '2024-12-01', true, ARRAY['Construction', 'Major Client']),

-- Solicitor Firms
('cl333333-3333-3333-3333-333333333333', 'Henderson & Associates Solicitors', 'Solicitor', 'referrals@henderson-law.co.uk', '020 7456 7890', NULL, 
 '67 Legal Square', 'London', 'WC1A 3CC', 980000.00, 28, '2018-11-22', '2024-12-15', true, ARRAY['Referral Partner', 'Solicitor']),

('cl444444-4444-4444-4444-444444444444', 'Barnes McKenzie LLP', 'Solicitor', 'counsel@barnesmckenzie.com', '020 7567 8901', NULL, 
 'Law Chambers, 89 Chancery Lane', 'London', 'WC2A 4DD', 1250000.00, 19, '2021-02-14', '2024-11-08', true, ARRAY['Referral Partner', 'Solicitor']),

-- SME Companies
('cl555555-5555-5555-5555-555555555555', 'Apex Manufacturing Ltd', 'Company', 'admin@apexmfg.co.uk', '020 7678 9012', '34567890', 
 'Factory Road, Unit 12', 'London', 'E1A 5EE', 450000.00, 8, '2022-06-30', '2024-10-12', false, ARRAY['Manufacturing', 'SME']),

('cl666666-6666-6666-6666-666666666666', 'Creative Media Partners', 'Company', 'legal@creativemedia.co.uk', '020 7789 0123', '45678901', 
 'Media House, 34 Creative Street', 'London', 'N1A 6FF', 280000.00, 12, '2023-01-20', '2024-09-25', true, ARRAY['Media', 'SME', 'IP']),

-- Individual Clients
('cl777777-7777-7777-7777-777777777777', 'Dr. Elizabeth Morrison', 'Individual', 'e.morrison@email.com', '020 7890 1234', NULL, 
 '78 Harley Street', 'London', 'W1G 7GG', 125000.00, 3, '2023-09-15', '2024-08-30', true, ARRAY['Medical Professional', 'Clinical Negligence']),

('cl888888-8888-8888-8888-888888888888', 'Mr. James Peterson', 'Individual', 'j.peterson@email.com', '020 7901 2345', NULL, 
 '156 Residential Avenue', 'London', 'SW3 7HH', 85000.00, 2, '2024-02-10', '2024-07-18', false, ARRAY['Personal Injury']),

-- Insurance Companies
('cl999999-9999-9999-9999-999999999999', 'Premier Insurance Group', 'Company', 'claims@premierinsurance.co.uk', '020 7012 3456', '56789012', 
 'Insurance House, 90 Risk Street', 'London', 'EC3A 8II', 650000.00, 45, '2019-12-05', '2024-12-10', true, ARRAY['Insurance', 'Volume Client']),

-- Government Bodies
('claaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Department of Business Innovation', 'Company', 'legal.team@gov.uk', '020 7123 4567', NULL, 
 'Government Building, Westminster', 'London', 'SW1A 0AA', 180000.00, 6, '2023-03-20', '2024-05-15', false, ARRAY['Government', 'Public Sector']);

-- =============================================================================
-- ENQUIRIES DATA (Historical and Current)
-- =============================================================================

INSERT INTO public.enquiries (
  id, lex_reference, client_id, source, practice_area, matter_type, description, 
  estimated_value, actual_value, urgency, complexity, status, assigned_clerk_id, assigned_barrister_id,
  received_at, responded_at, converted_at, response_time_hours, conversion_probability,
  referral_source, clerk_notes, barrister_notes
) VALUES

-- Recent Converted Matters (High Value)
('e1111111-1111-1111-1111-111111111111', 'LEX2024-1001', 'cl111111-1111-1111-1111-111111111111', 'Direct', 'Commercial', 'Contract Dispute', 
 'Multi-million pound software licensing dispute with potential breach of contract claims', 
 850000.00, 920000.00, 'This Week', 'Complex', 'Converted', 'c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
 '2024-11-01 09:30:00+00', '2024-11-01 11:15:00+00', '2024-11-25 14:30:00+00', 1.75, 0.92,
 NULL, 'High-profile client, requires KC level representation', 'Complex IP and contract issues resolved successfully'),

('e2222222-2222-2222-2222-222222222222', 'LEX2024-1002', 'cl222222-2222-2222-2222-222222222222', 'Referral', 'Construction', 'Defects Claim', 
 'Major construction defects claim relating to office development in Canary Wharf', 
 650000.00, 580000.00, 'This Month', 'Complex', 'Converted', 'c2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111',
 '2024-10-15 14:20:00+00', '2024-10-15 16:45:00+00', '2024-12-01 10:00:00+00', 2.42, 0.85,
 'Henderson & Associates Solicitors', 'Standard construction matter, good relationship with client', 'Settlement achieved avoiding lengthy trial'),

-- Current Active Enquiries
('e3333333-3333-3333-3333-333333333333', 'LEX2024-1145', 'cl333333-3333-3333-3333-333333333333', 'Email', 'Employment', 'Discrimination Claim', 
 'Senior executive alleging discrimination and wrongful dismissal', 
 180000.00, NULL, 'This Week', 'Medium', 'In Progress', 'c3333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222',
 '2024-12-10 08:45:00+00', '2024-12-10 10:30:00+00', NULL, 1.75, 0.75,
 NULL, 'Client seeking urgent resolution before Christmas', 'Preliminary review completed, strong case'),

('e4444444-4444-4444-4444-444444444444', 'LEX2024-1146', 'cl555555-5555-5555-5555-555555555555', 'Phone', 'Commercial', 'Supply Chain Dispute', 
 'Breach of supply agreement causing production delays', 
 95000.00, NULL, 'Immediate', 'Medium', 'Assigned', 'c1111111-1111-1111-1111-111111111111', 'b5555555-5555-5555-5555-555555555555',
 '2024-12-16 15:30:00+00', NULL, NULL, NULL, 0.68,
 NULL, 'Urgent - client production line affected', NULL),

-- New Enquiries Awaiting Response
('e5555555-5555-5555-5555-555555555555', NULL, 'cl777777-7777-7777-7777-777777777777', 'Website', 'Clinical Negligence', 'Medical Negligence', 
 'Potential misdiagnosis leading to delayed treatment and complications', 
 220000.00, NULL, 'This Month', 'Complex', 'Assigned', 'c5555555-5555-5555-5555-555555555555', 'b3333333-3333-3333-3333-333333333333',
 '2024-12-17 12:00:00+00', NULL, NULL, NULL, 0.72,
 NULL, 'Medical records review required', NULL),

('e6666666-6666-6666-6666-666666666666', NULL, 'cl888888-8888-8888-8888-888888888888', 'Referral', 'Personal Injury', 'Road Traffic Accident', 
 'Serious RTA with life-changing injuries, liability disputed', 
 150000.00, NULL, 'This Week', 'Medium', 'New', NULL, NULL,
 '2024-12-18 09:15:00+00', NULL, NULL, NULL, 0.65,
 'Barnes McKenzie LLP', NULL, NULL),

-- Lost Opportunities (for analysis)
('e7777777-7777-7777-7777-777777777777', 'LEX2024-0890', 'cl666666-6666-6666-6666-666666666666', 'Email', 'Data Protection', 'GDPR Breach', 
 'Data breach notification and regulatory investigation', 
 75000.00, NULL, 'Immediate', 'Medium', 'Lost', 'c4444444-4444-4444-4444-444444444444', 'b6666666-6666-6666-6666-666666666666',
 '2024-11-20 16:45:00+00', '2024-11-23 14:20:00+00', NULL, 69.58, 0.45,
 NULL, 'Client went with in-house team', 'Response delayed due to workload'),

-- Historical Matters for Performance Analysis
('e8888888-8888-8888-8888-888888888888', 'LEX2024-0756', 'cl999999-9999-9999-9999-999999999999', 'Phone', 'Insurance', 'Coverage Dispute', 
 'Professional indemnity claim coverage dispute', 
 45000.00, 38000.00, 'This Month', 'Simple', 'Converted', 'c2222222-2222-2222-2222-222222222222', 'b7777777-7777-7777-7777-777777777777',
 '2024-09-15 11:30:00+00', '2024-09-15 14:45:00+00', '2024-10-20 16:00:00+00', 3.25, 0.82,
 NULL, 'Standard insurance matter', 'Quick resolution achieved'),

('e9999999-9999-9999-9999-999999999999', 'LEX2024-0623', 'claaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Direct', 'Administrative & Public', 'Judicial Review', 
 'Challenge to government procurement decision', 
 85000.00, 92000.00, 'This Month', 'Complex', 'Converted', 'c1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222',
 '2024-08-05 10:00:00+00', '2024-08-05 11:30:00+00', '2024-09-30 15:30:00+00', 1.5, 0.78,
 NULL, 'Government matter requiring careful handling', 'Successful outcome, good precedent set'),

-- Volume enquiries for statistical analysis
('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LEX2024-1055', 'cl444444-4444-4444-4444-444444444444', 'Referral', 'Employment', 'Unfair Dismissal', 
 'Employee claiming unfair dismissal and discrimination', 
 25000.00, 28000.00, 'Flexible', 'Simple', 'Converted', 'c3333333-3333-3333-3333-333333333333', 'b6666666-6666-6666-6666-666666666666',
 '2024-10-08 13:20:00+00', '2024-10-09 09:15:00+00', '2024-11-15 12:00:00+00', 19.92, 0.71,
 'Henderson & Associates Solicitors', 'Straightforward employment matter', 'Settlement negotiated successfully');

-- =============================================================================
-- TASKS DATA
-- =============================================================================

INSERT INTO public.tasks (
  id, enquiry_id, barrister_id, clerk_id, type, title, description,
  due_date, priority, estimated_hours, actual_hours, completed_at, points, quality_score,
  status, completion_notes
) VALUES

-- Active Tasks
('t1111111-1111-1111-1111-111111111111', 'e3333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', NULL, 
 'Research', 'Research Recent Discrimination Case Law', 'Review recent Court of Appeal decisions on discrimination in senior executive roles',
 '2024-12-20 17:00:00+00', 'High', 4.0, NULL, NULL, 8, NULL, 'In Progress', NULL),

('t2222222-2222-2222-2222-222222222222', 'e4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555', NULL, 
 'Call', 'Initial Client Conference', 'Conference with client to understand supply chain issues and gather evidence',
 '2024-12-19 16:00:00+00', 'Urgent', 2.0, NULL, NULL, 10, NULL, 'Pending', NULL),

('t3333333-3333-3333-3333-333333333333', 'e5555555-5555-5555-5555-555555555555', 'b3333333-3333-3333-3333-333333333333', NULL, 
 'Document_Review', 'Medical Records Review', 'Comprehensive review of medical records and expert reports',
 '2024-12-21 12:00:00+00', 'High', 6.0, NULL, NULL, 12, NULL, 'Pending', NULL),

-- Completed Tasks (for performance metrics)
('t4444444-4444-4444-4444-444444444444', 'e1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', NULL, 
 'Proposal', 'Draft Settlement Proposal', 'Prepare comprehensive settlement proposal for software licensing dispute',
 '2024-11-10 17:00:00+00', 'High', 8.0, 7.5, '2024-11-08 16:30:00+00', 15, 5, 'Completed', 'Excellent proposal led to quick settlement'),

('t5555555-5555-5555-5555-555555555555', 'e2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', NULL, 
 'Meeting', 'Site Inspection Meeting', 'Attend site inspection with construction experts and client representatives',
 '2024-11-20 10:00:00+00', 'Medium', 4.0, 5.0, '2024-11-20 15:30:00+00', 8, 4, 'Completed', 'Productive site visit, key evidence gathered'),

('t6666666-6666-6666-6666-666666666666', 'e8888888-8888-8888-8888-888888888888', 'b7777777-7777-7777-7777-777777777777', NULL, 
 'Research', 'Insurance Policy Analysis', 'Detailed analysis of professional indemnity policy terms',
 '2024-09-20 17:00:00+00', 'Medium', 3.0, 2.5, '2024-09-18 14:20:00+00', 6, 4, 'Completed', 'Clear policy interpretation provided to client'),

-- Overdue Tasks (for urgent attention view)
('t7777777-7777-7777-7777-777777777777', 'e6666666-6666-6666-6666-666666666666', NULL, 'c4444444-4444-4444-4444-444444444444', 
 'Follow-up', 'Chase Medical Records', 'Follow up with hospital for outstanding medical records',
 '2024-12-17 12:00:00+00', 'High', 1.0, NULL, NULL, 3, NULL, 'Pending', NULL),

-- Clerk Administrative Tasks
('t8888888-8888-8888-8888-888888888888', NULL, NULL, 'c1111111-1111-1111-1111-111111111111', 
 'Follow-up', 'Monthly Fee Review', 'Review and chase outstanding fees from November matters',
 '2024-12-20 17:00:00+00', 'Medium', 2.0, NULL, NULL, 5, NULL, 'In Progress', NULL);

-- =============================================================================
-- CSV IMPORTS DATA (Sample Import History)
-- =============================================================================

INSERT INTO public.csv_imports (
  id, filename, original_filename, file_size_bytes, file_hash, type, import_mode, status,
  total_rows, processed_rows, success_rows, error_rows, started_at, completed_at, processing_duration_ms,
  imported_by, import_notes, errors
) VALUES

('csv11111-1111-1111-1111-111111111111', 'lex_export_20241201.csv', 'LEX_Export_December_2024.csv', 
 245600, 'sha256:a1b2c3d4e5f6...', 'enquiries', 'upsert', 'completed',
 128, 128, 125, 3, '2024-12-01 08:30:00+00', '2024-12-01 08:33:45+00', 225000,
 '11111111-1111-1111-1111-111111111111', 'Monthly LEX import - December 2024', 
 '{"row_errors": [{"row": 45, "error": "Invalid email format"}, {"row": 67, "error": "Missing required field: client_name"}, {"row": 89, "error": "Invalid date format"}]}'::jsonb),

('csv22222-2222-2222-2222-222222222222', 'lex_export_20241115.csv', 'LEX_Export_November_Mid.csv', 
 189300, 'sha256:b2c3d4e5f6g7...', 'enquiries', 'insert', 'completed',
 95, 95, 92, 3, '2024-11-15 09:15:00+00', '2024-11-15 09:17:30+00', 150000,
 '22222222-2222-2222-2222-222222222222', 'Mid-November catch-up import', 
 '{"row_errors": [{"row": 23, "error": "Duplicate LEX reference"}, {"row": 34, "error": "Invalid practice area"}, {"row": 78, "error": "Invalid urgency level"}]}'::jsonb),

('csv33333-3333-3333-3333-333333333333', 'client_update_20241210.csv', 'Client_Updates_December.csv', 
 67800, 'sha256:c3d4e5f6g7h8...', 'clients', 'update_only', 'completed',
 45, 45, 43, 2, '2024-12-10 14:20:00+00', '2024-12-10 14:21:15+00', 75000,
 '33333333-3333-3333-3333-333333333333', 'Client information updates from marketing team', 
 '{"row_errors": [{"row": 12, "error": "Client not found"}, {"row": 38, "error": "Invalid company number format"}]}'::jsonb);

-- =============================================================================
-- ENGAGEMENT SCORE CALCULATION TRIGGER
-- =============================================================================

-- Update engagement scores for all barristers based on the seed data
SELECT public.update_all_engagement_scores();

-- Update workloads based on current assignments
SELECT public.update_all_workloads();

-- Update conversion probabilities for active enquiries
SELECT public.update_all_conversion_probabilities();

-- =============================================================================
-- SEED DATA SUMMARY
-- =============================================================================

DO $$
DECLARE
  profile_count INTEGER;
  barrister_count INTEGER;
  clerk_count INTEGER;
  client_count INTEGER;
  enquiry_count INTEGER;
  task_count INTEGER;
  import_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  SELECT COUNT(*) INTO barrister_count FROM public.barristers;
  SELECT COUNT(*) INTO clerk_count FROM public.clerks;
  SELECT COUNT(*) INTO client_count FROM public.clients;
  SELECT COUNT(*) INTO enquiry_count FROM public.enquiries;
  SELECT COUNT(*) INTO task_count FROM public.tasks;
  SELECT COUNT(*) INTO import_count FROM public.csv_imports;
  
  RAISE NOTICE 'BDIP Seed Data Loaded Successfully:';
  RAISE NOTICE '- Profiles: %', profile_count;
  RAISE NOTICE '- Barristers: %', barrister_count;
  RAISE NOTICE '- Clerks: %', clerk_count;
  RAISE NOTICE '- Clients: %', client_count;
  RAISE NOTICE '- Enquiries: %', enquiry_count;
  RAISE NOTICE '- Tasks: %', task_count;
  RAISE NOTICE '- CSV Imports: %', import_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Database ready for testing and development!';
END $$;

-- =============================================================================
-- SEED DATA COMPLETE
-- =============================================================================