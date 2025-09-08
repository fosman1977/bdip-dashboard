# BDIP Database Architecture Guide

## Overview

This document outlines the comprehensive PostgreSQL/Supabase database architecture for the Business Development Intelligence Platform (BDIP) - a UK barristers' chambers management system.

## Architecture Decisions

### Core Design Principles

1. **UUID Primary Keys**: All tables use UUIDs for global uniqueness and future-proofing for multi-chamber deployments
2. **Soft Deletes**: All entities use `deleted_at` timestamps instead of hard deletes for audit compliance and data recovery
3. **Comprehensive Audit Trails**: Legal compliance requires full change tracking for all enquiry and assignment modifications
4. **Row Level Security**: Database-level access controls enforce role-based permissions
5. **Performance-First Indexes**: Optimized for dashboard queries and high-volume CSV operations

### Multi-Tenancy Considerations

While currently designed for single-chamber use, the architecture supports future multi-tenancy through:
- UUID-based relationships that can easily accommodate chamber_id fields
- RLS policies designed to be extended with chamber-based filtering
- Separate audit trails that can be partitioned by chamber

## Database Schema

### Core Entity Relationships

```
Profiles (Supabase Auth Extension)
├── Barristers (1:1 via profile_id)
├── Clerks (1:1 via profile_id)
└── [Future: Other staff types]

Clients
├── Enquiries (1:N)
└── [Future: Matters, Instructions]

Enquiries
├── Tasks (1:N)
├── Assignments (N:N via assignment_audit_log)
└── Audit Trail (1:N via enquiry_audit_log)

CSV_Imports
└── Processing History (for LEX integration)
```

### Business Logic Tables

#### 1. Profiles Table
- Extends Supabase `auth.users` with role-based information
- Supports roles: `barrister`, `clerk`, `admin`, `read_only`
- Links to specialized role tables via `profile_id`

#### 2. Barristers Table
- Professional details: name, email, year of call, practice areas
- Seniority levels: Pupil, Junior, Middle, Senior, KC
- Performance tracking: engagement_score, current_workload
- Calculated fields updated by triggers and functions

#### 3. Clerks Table
- Administrative staff managing enquiries and assignments
- Workload management: max_workload, current_workload
- Team-based organization support
- Performance metrics for response times

#### 4. Clients Table
- Three types: Individual, Company, Solicitor
- Companies House integration ready (company_number field)
- Relationship tracking: total_value, matter_count, instruction dates
- Marketing preferences and GDPR compliance fields

#### 5. Enquiries Table (Central Entity)
- LEX system integration via lex_reference
- Complete enquiry lifecycle: New → Assigned → In Progress → Converted/Lost
- Value tracking: estimated_value, actual_value
- Performance metrics: response_time_hours, conversion_probability
- Assignment tracking with audit trail

#### 6. Tasks Table
- Workflow management for barristers and clerks
- Multiple task types: Call, Email, Research, Meeting, Proposal, etc.
- Priority and points-based system for performance tracking
- Quality scoring for engagement calculations

### Audit and Compliance Tables

#### 1. Enquiry Audit Log
- Comprehensive change tracking for legal compliance
- JSON storage of old/new values for efficient querying
- User context: user_id, role, session_id, IP address
- Supports 7+ year legal data retention requirements

#### 2. Assignment Audit Log
- Specialized tracking for enquiry assignments
- Supports automatic vs manual assignment tracking
- Algorithm scoring for AI-driven assignments
- Critical for understanding decision-making processes

## Business Algorithms Implementation

### 1. Engagement Score Calculation

The engagement score (0-100) uses weighted metrics:

```sql
engagement_score = (
  response_score * 0.30 +      -- Response time component (30%)
  conversion_score * 0.40 +    -- Win rate component (40%)
  satisfaction_score * 0.20 +  -- Client satisfaction (20%)
  revenue_score * 0.10         -- Revenue generated (10%)
)
```

**Components:**
- **Response Score**: `100 - (avg_response_hours * 4)` (capped 0-100)
- **Conversion Score**: `conversion_rate * 100`
- **Satisfaction Score**: `avg_quality_rating * 20` (5-point scale to 100)
- **Revenue Score**: `total_revenue / 1000` (capped at 100)

### 2. Conversion Probability Algorithm

Base probability of 50% adjusted by:
- **Historical Client**: +20% for existing clients
- **Response Time**: +15% (<2hrs), +5% (<24hrs), -10% (>24hrs)
- **High Value**: +10% for matters >£50k
- **Source Quality**: +15% (referrals), -5% (website), +10% (direct)
- **Urgency**: +8% (immediate), -3% (flexible)
- **Practice Area Performance**: +5% for high-performing areas

### 3. Enquiry Routing Algorithm

Barrister selection considers:
1. **Practice Area Match**: Required filter
2. **Complexity Rules**: Pupils excluded from complex matters
3. **Value Thresholds**: Senior/KC required for >£100k matters
4. **Availability**: Current workload vs maximum capacity
5. **Performance**: Engagement score weighted by availability
6. **Urgency Bonuses**: Senior barristers get priority for urgent matters

## Row Level Security (RLS) Architecture

### Role-Based Access Control

#### Admin Role
- Full access to all data
- Can manage users, settings, and system configuration
- Access to audit logs and sensitive business intelligence

#### Clerk Role
- Full access to enquiries and assignments
- Can create/update clients and enquiries
- View all barrister and clerk information
- Senior clerks additionally access enquiry audit logs

#### Barrister Role
- View own profile and performance data
- Access assigned enquiries and tasks
- Update completion status and add notes
- Cannot see other barristers' detailed performance
- Cannot modify assignments or sensitive fields

#### Read-Only Role
- View-only access to dashboards and reports
- No personal information or sensitive data
- Suitable for management reporting

### Security Functions

The RLS implementation includes helper functions:
- `auth.user_profile()`: Get current user's profile
- `auth.has_role(role)`: Check specific role
- `auth.current_barrister()`: Get barrister record for current user
- `auth.current_clerk()`: Get clerk record for current user

### Secure Operations

Special SECURITY DEFINER functions for controlled operations:
- `complete_barrister_task()`: Safe task completion by barristers
- `respond_to_enquiry()`: Safe enquiry response recording

## Performance Optimization

### Indexing Strategy

#### Primary Performance Indexes
- **Enquiry Status**: Fast dashboard filtering by status
- **Assignment Lookups**: Clerk and barrister assignment queries
- **Date Ranges**: Received_at, responded_at, converted_at for reporting
- **Practice Areas**: GIN indexes for array matching
- **Workload Management**: Current workload and availability

#### Composite Indexes
- **(status, received_at)**: Dashboard date filtering
- **(assigned_clerk_id, status)**: Clerk workload views
- **(assigned_barrister_id, status)**: Barrister task lists

#### Analytics Indexes
- **Revenue Analysis**: Value-based sorting and filtering
- **Source Performance**: Source-based analytics
- **Client Relationships**: Value and matter count sorting

### Query Optimization

#### Materialized Views
Pre-built analytics views for complex dashboard queries:
- `daily_dashboard_stats`: Real-time KPI calculations
- `barrister_performance`: Comprehensive performance metrics
- `conversion_funnel`: Multi-stage conversion analysis
- `urgent_attention_items`: Overdue tasks and responses

#### Trigger Optimization
Automated calculations to reduce query complexity:
- **Response Time**: Calculated on enquiry response
- **Conversion Probability**: Updated when key fields change
- **Workload Counters**: Real-time workload tracking
- **Engagement Scores**: Updated on significant events

## Triggers and Automation

### Business Logic Triggers

1. **Response Time Calculation**: Auto-calculates hours between received_at and responded_at
2. **Conversion Probability Updates**: Recalculates when enquiry conditions change
3. **Workload Management**: Real-time updates on assignment changes
4. **Client Statistics**: Automatic matter_count and total_value updates
5. **Engagement Scoring**: Triggered updates on conversion/task completion

### Data Integrity Triggers

1. **Practice Area Validation**: Ensures valid practice areas from standard list
2. **Soft Delete Enforcement**: Prevents hard deletion of core entities
3. **Audit Trail Creation**: Automatic logging of all significant changes
4. **CSV Import Progress**: Status and completion tracking

### Performance Triggers

1. **Updated_at Timestamps**: Automatic timestamp updates
2. **Batch Score Updates**: Deferred engagement score calculations
3. **Statistics Maintenance**: Real-time counter updates

## Analytics and Reporting Architecture

### Dashboard Views

#### Daily Dashboard
- New enquiries today vs yesterday
- Response time performance
- Conversion rates and revenue
- Urgent items requiring attention

#### Performance Analytics
- Barrister rankings and engagement scores
- Conversion funnel analysis
- Practice area performance comparison
- Source quality assessment

#### Operational Views
- Clerk workload distribution
- Overdue tasks and responses
- Client relationship status
- Pipeline value analysis

### Real-Time Features

The architecture supports real-time updates through:
- Supabase realtime subscriptions on key tables
- Efficient incremental updates via triggers
- Minimal data transfer through selective field updates

## LEX Integration Architecture

### CSV Import/Export Pipeline

#### Import Process
1. **File Validation**: Size, format, and content validation
2. **Parsing**: Row-by-row processing with error tracking
3. **Data Mapping**: LEX format to BDIP schema transformation
4. **Upsert Operations**: Insert new records, update existing
5. **Progress Tracking**: Real-time status updates
6. **Error Reporting**: Detailed error logs with row numbers

#### Export Process
1. **Data Extraction**: Recent updates and status changes
2. **Format Transformation**: BDIP to LEX format mapping
3. **Incremental Updates**: Only changed records
4. **Validation**: Ensure data integrity before export

#### Error Handling
- **Row-Level Errors**: Continue processing, log specific issues
- **Validation Failures**: Detailed field-level error messages
- **Recovery Mechanisms**: Retry failed operations
- **Audit Trail**: Complete import/export history

## Deployment Guide

### Migration Order

Execute migrations in sequence:

1. **20250101000000_create_core_schema.sql**
   - Core tables, indexes, and constraints
   - Basic data validation rules
   - Performance indexes

2. **20250102000000_create_rls_policies.sql**
   - Row Level Security policies
   - Role-based access functions
   - Secure operation functions

3. **20250103000000_create_business_functions.sql**
   - Engagement scoring algorithms
   - Conversion probability calculations
   - Routing and workload functions

4. **20250104000000_create_triggers.sql**
   - Automated business logic
   - Audit trail maintenance
   - Data validation and integrity

5. **20250105000000_create_analytics_views.sql**
   - Dashboard and reporting views
   - Performance analytics
   - Operational monitoring

6. **seed.sql** (Development/Testing Only)
   - Realistic test data
   - Sample enquiries and performance metrics

### Supabase Configuration

#### Environment Variables Required
```env
# Database
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_anonymous_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Authentication
SUPABASE_JWT_SECRET=your_jwt_secret
```

#### Required Extensions
- `uuid-ossp`: UUID generation
- `pg_stat_statements`: Query performance monitoring
- `btree_gin`: Composite indexing for arrays

#### RLS Configuration
Enable RLS on all tables (handled by migrations):
```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- (Applied to all core tables)
```

### Production Considerations

#### Performance Monitoring
- Monitor slow queries via `pg_stat_statements`
- Track index usage and efficiency
- Monitor trigger execution times
- Set up alerts for query timeouts

#### Backup Strategy
- Daily automated backups
- Point-in-time recovery configuration
- Audit log archival (7-year retention)
- Cross-region backup replication

#### Security Hardening
- Regular RLS policy review
- Function permission audits
- Connection limit monitoring
- SSL/TLS encryption enforcement

#### Scaling Considerations
- Connection pooling via PgBouncer
- Read replicas for analytics workloads
- Partitioning for audit logs
- Archive old enquiry data

## Testing and Validation

### Automated Tests

#### Data Integrity Tests
- Foreign key constraint validation
- Soft delete enforcement
- Audit trail completeness
- RLS policy effectiveness

#### Business Logic Tests
- Engagement score calculations
- Conversion probability accuracy
- Routing algorithm correctness
- Workload calculation precision

#### Performance Tests
- Dashboard query response times
- CSV import/export throughput
- Concurrent user scenarios
- Large dataset operations

### Manual Verification

#### Role-Based Access Testing
- Test each user role's data visibility
- Verify restricted operations fail appropriately
- Confirm audit trails capture all changes
- Validate secure functions work correctly

#### Business Workflow Testing
- Complete enquiry lifecycle
- Assignment and reassignment processes
- Task creation and completion
- Client relationship updates

## Maintenance Procedures

### Regular Maintenance

#### Daily
- CSV import/export monitoring
- Engagement score updates (automated)
- Error log review
- Performance metric collection

#### Weekly
- Audit log analysis
- Index usage review
- Query performance analysis
- Data quality checks

#### Monthly
- Full system performance review
- Archive old audit logs
- Update business logic parameters
- Security policy review

### Troubleshooting Guide

#### Common Issues

**Slow Dashboard Queries**
- Check index usage with `EXPLAIN ANALYZE`
- Verify statistics are up to date
- Consider query optimization or additional indexes

**RLS Policy Conflicts**
- Review policy logic with `EXPLAIN (COSTS FALSE, VERBOSE TRUE, FORMAT JSON)`
- Verify user role assignments
- Check function permissions

**CSV Import Failures**
- Review error logs in csv_imports table
- Validate file format and encoding
- Check data mapping accuracy

**Trigger Performance Issues**
- Monitor trigger execution time
- Consider async processing for complex calculations
- Review trigger logic for optimization

## Future Enhancements

### Phase 2 Considerations

#### Multi-Chamber Support
- Add chamber_id to all tables
- Update RLS policies for chamber isolation
- Implement chamber-specific configurations

#### Advanced Analytics
- Machine learning integration for conversion prediction
- Advanced reporting dashboards
- Predictive workload management

#### External Integrations
- Companies House API integration
- Court system integrations
- Email system automation
- Calendar system synchronization

#### Performance Enhancements
- Query result caching
- Materialized view automation
- Advanced partitioning strategies
- Real-time data synchronization

---

This architecture provides a robust, scalable foundation for the BDIP system while maintaining the flexibility to evolve with changing business requirements.