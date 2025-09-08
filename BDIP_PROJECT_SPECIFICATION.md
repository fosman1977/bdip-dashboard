# Business Development Intelligence Platform (BDIP)
## Complete Build Specification

### Project Overview
**Purpose**: Transform a UK barristers' chambers from manual enquiry tracking to an intelligent, automated business development system.

**Core Problem**: Chambers currently track enquiries in LEX (legacy system, CSV-only), losing 30% of opportunities due to poor follow-up and having no visibility into conversion rates or barrister performance.

**Solution**: Build a modern web platform that imports LEX data, adds intelligence layers, and provides real-time dashboards for clerks, barristers, and management.

### System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
├──────────────┬────────────────┬────────────────┬───────────┤
│   Frontend   │   API Routes   │  CSV Pipeline  │   Jobs    │
├──────────────┴────────────────┴────────────────┴───────────┤
│                        Supabase                              │
├──────────────┬────────────────┬────────────────┬───────────┤
│   PostgreSQL │      Auth      │    Storage     │ Realtime  │
└──────────────┴────────────────┴────────────────┴───────────┘
```

### Directory Structure
```
bdip/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── clerk/
│   │   │   ├── page.tsx
│   │   │   ├── enquiries/
│   │   │   └── assignments/
│   │   ├── barrister/
│   │   │   ├── page.tsx
│   │   │   ├── tasks/
│   │   │   └── performance/
│   │   └── admin/
│   │       ├── page.tsx
│   │       ├── import/
│   │       └── settings/
│   ├── api/
│   │   ├── auth/
│   │   ├── enquiries/
│   │   ├── barristers/
│   │   ├── csv/
│   │   │   ├── import/
│   │   │   └── export/
│   │   └── webhooks/
│   └── layout.tsx
├── components/
│   ├── ui/           (shadcn components)
│   ├── dashboard/
│   ├── charts/
│   └── forms/
├── lib/
│   ├── supabase/
│   ├── csv/
│   ├── algorithms/
│   └── utils/
├── types/
├── middleware.ts
└── supabase/
    ├── migrations/
    └── seed.sql
```

### Database Schema

```sql
-- Core Tables

CREATE TABLE barristers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  year_of_call INTEGER,
  practice_areas TEXT[],
  seniority TEXT CHECK (seniority IN ('Pupil', 'Junior', 'Middle', 'Senior', 'KC')),
  is_active BOOLEAN DEFAULT true,
  engagement_score DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clerks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  team TEXT,
  is_senior BOOLEAN DEFAULT false,
  max_workload INTEGER DEFAULT 20,
  current_workload INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('Individual', 'Company', 'Solicitor')),
  email TEXT,
  phone TEXT,
  company_number TEXT,
  total_value DECIMAL(10,2) DEFAULT 0,
  matter_count INTEGER DEFAULT 0,
  first_instruction DATE,
  last_instruction DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lex_reference TEXT UNIQUE,
  client_id UUID REFERENCES clients(id),
  source TEXT CHECK (source IN ('Email', 'Phone', 'Website', 'Referral', 'Direct')),
  practice_area TEXT,
  matter_type TEXT,
  description TEXT,
  estimated_value DECIMAL(10,2),
  urgency TEXT CHECK (urgency IN ('Immediate', 'This Week', 'This Month', 'Flexible')),
  status TEXT CHECK (status IN ('New', 'Assigned', 'In Progress', 'Converted', 'Lost')),
  assigned_clerk_id UUID REFERENCES clerks(id),
  assigned_barrister_id UUID REFERENCES barristers(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  response_time_hours INTEGER,
  conversion_probability DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_id UUID REFERENCES enquiries(id),
  barrister_id UUID REFERENCES barristers(id),
  clerk_id UUID REFERENCES clerks(id),
  type TEXT CHECK (type IN ('Call', 'Email', 'Research', 'Meeting', 'Proposal', 'Follow-up')),
  description TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  points INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE csv_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  type TEXT CHECK (type IN ('enquiries', 'clients', 'matters', 'fees')),
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_rows INTEGER,
  processed_rows INTEGER,
  error_rows INTEGER,
  errors JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_enquiries_status ON enquiries(status);
CREATE INDEX idx_enquiries_clerk ON enquiries(assigned_clerk_id);
CREATE INDEX idx_enquiries_barrister ON enquiries(assigned_barrister_id);
CREATE INDEX idx_tasks_barrister ON tasks(barrister_id);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_csv_imports_status ON csv_imports(status);

-- RLS Policies
ALTER TABLE barristers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clerks ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_barristers_updated_at BEFORE UPDATE ON barristers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- (Repeat for all tables)
```

### LEX CSV Specifications

#### Import Format (from LEX)
```csv
"Client","Matter Description","Fee Earner","Date Received","Value","Status","Reference"
"Smith Ltd","Commercial Dispute","John Smith QC","01/03/2025","£50,000","New","LEX2025-001"
"Jones & Co","Employment Tribunal","Sarah Jones","28/02/2025","£15,000","In Progress","LEX2025-002"
```

#### Export Format (to LEX)
```csv
"Reference","Status","Assigned To","Response Date","Notes"
"LEX2025-001","Converted","John Smith QC","02/03/2025","Initial consultation completed"
"LEX2025-002","In Progress","Sarah Jones","01/03/2025","Awaiting client documents"
```

### Core Algorithms

#### 1. Barrister Engagement Score
```typescript
interface EngagementMetrics {
  responseTime: number;      // Hours to respond (weight: 30%)
  conversionRate: number;     // Win rate (weight: 40%)
  clientSatisfaction: number; // 1-5 rating (weight: 20%)
  revenueGenerated: number;   // Total £ (weight: 10%)
}

function calculateEngagementScore(metrics: EngagementMetrics): number {
  const responseScore = Math.max(0, 100 - (metrics.responseTime * 4));
  const conversionScore = metrics.conversionRate * 100;
  const satisfactionScore = metrics.clientSatisfaction * 20;
  const revenueScore = Math.min(100, metrics.revenueGenerated / 1000);
  
  return (
    responseScore * 0.3 +
    conversionScore * 0.4 +
    satisfactionScore * 0.2 +
    revenueScore * 0.1
  );
}
```

#### 2. Enquiry Routing Algorithm
```typescript
interface RoutingCriteria {
  practiceArea: string;
  complexity: 'Simple' | 'Medium' | 'Complex';
  value: number;
  urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible';
}

function findBestBarrister(
  criteria: RoutingCriteria,
  availableBarristers: Barrister[]
): Barrister | null {
  return availableBarristers
    .filter(b => b.practiceAreas.includes(criteria.practiceArea))
    .filter(b => {
      if (criteria.complexity === 'Complex') return b.seniority !== 'Pupil';
      if (criteria.value > 100000) return ['Senior', 'KC'].includes(b.seniority);
      return true;
    })
    .sort((a, b) => {
      // Sort by engagement score and current workload
      const scoreA = a.engagementScore * (1 - a.currentWorkload / 100);
      const scoreB = b.engagementScore * (1 - b.currentWorkload / 100);
      return scoreB - scoreA;
    })[0] || null;
}
```

#### 3. Conversion Probability
```typescript
function calculateConversionProbability(enquiry: Enquiry): number {
  let probability = 0.5; // Base probability
  
  // Historical client
  if (enquiry.client.matterCount > 0) probability += 0.2;
  
  // Response time
  if (enquiry.responseTimeHours < 2) probability += 0.15;
  else if (enquiry.responseTimeHours < 24) probability += 0.05;
  else probability -= 0.1;
  
  // Value indicators
  if (enquiry.estimatedValue > 50000) probability += 0.1;
  
  // Source quality
  if (enquiry.source === 'Referral') probability += 0.15;
  if (enquiry.source === 'Website') probability -= 0.05;
  
  return Math.min(0.95, Math.max(0.05, probability));
}
```

### API Endpoints
```typescript
// Core endpoints structure
GET    /api/enquiries          // List with filters
POST   /api/enquiries          // Create new
GET    /api/enquiries/[id]     // Get single
PATCH  /api/enquiries/[id]     // Update
DELETE /api/enquiries/[id]     // Soft delete

POST   /api/enquiries/[id]/assign     // Assign to barrister
POST   /api/enquiries/[id]/convert    // Mark as converted

GET    /api/barristers         // List all
GET    /api/barristers/[id]/dashboard // Personal dashboard data
GET    /api/barristers/[id]/tasks     // Assigned tasks
POST   /api/barristers/[id]/complete-task // Mark task complete

GET    /api/clerks/workload    // Current workload view
GET    /api/clerks/queue       // Unassigned enquiries
POST   /api/clerks/bulk-assign // Bulk assignment

POST   /api/csv/import         // Upload CSV for import
GET    /api/csv/export         // Generate export CSV
GET    /api/csv/import-status/[id] // Check import progress

GET    /api/reports/daily      // Daily summary
GET    /api/reports/conversion // Conversion funnel
GET    /api/reports/performance // Barrister rankings
```

### UI Components

#### 1. Clerk Dashboard
```tsx
// Main components needed:
<EnquiryQueue />        // New enquiries awaiting assignment
<WorkloadMonitor />     // Real-time clerk/barrister capacity
<QuickAssign />         // Drag-drop assignment interface
<ResponseTracker />     // Overdue responses alert
<DailyStats />          // Today's metrics
```

#### 2. Barrister Dashboard
```tsx
// Main components needed:
<MyTasks />             // Personal task list
<EngagementScore />     // Current score and trend
<ConversionRate />      // Personal success metrics
<RecentEnquiries />     // Recently assigned matters
<PerformanceChart />    // Historical performance
```

#### 3. Management Dashboard
```tsx
// Main components needed:
<ConversionFunnel />    // Enquiry to instruction funnel
<RevenueChart />        // Revenue trends
<BarristerRankings />   // Performance league table
<SourceAnalysis />      // Where enquiries come from
<PracticeAreaBreakdown /> // Work type distribution
```

### Scheduled Jobs
```typescript
// Daily jobs configuration
const scheduledJobs = {
  'importLexData': {
    schedule: '0 6 * * *',  // 6am daily
    handler: 'importLexCSV',
    timeout: 300000
  },
  'exportToLex': {
    schedule: '0 19 * * *', // 7pm daily
    handler: 'exportUpdatesToLex',
    timeout: 300000
  },
  'calculateScores': {
    schedule: '0 */2 * * *', // Every 2 hours
    handler: 'updateEngagementScores',
    timeout: 60000
  },
  'sendReminders': {
    schedule: '0 9,14 * * *', // 9am and 2pm
    handler: 'sendTaskReminders',
    timeout: 60000
  },
  'generateReports': {
    schedule: '0 8 * * 1', // Monday 8am
    handler: 'weeklyReports',
    timeout: 120000
  }
};
```

### Environment Variables
```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Email
RESEND_API_KEY=your_resend_key
EMAIL_FROM=bdip@chambers.co.uk

# External APIs  
COMPANIES_HOUSE_API_KEY=your_api_key

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
LEX_CSV_FOLDER=/shared/lex/exports
LEX_IMPORT_FOLDER=/shared/lex/imports

# Feature Flags
ENABLE_AI_SCORING=true
ENABLE_AUTO_ROUTING=true
```

### Deployment Configuration

#### Vercel Configuration
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["lhr1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase-url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key",
    "SUPABASE_SERVICE_KEY": "@supabase-service-key"
  },
  "crons": [
    {
      "path": "/api/cron/import",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/export",
      "schedule": "0 19 * * *"
    }
  ]
}
```

### Testing Requirements
```typescript
// Key test scenarios
describe('CSV Import', () => {
  test('handles 10,000 row files');
  test('validates required fields');
  test('handles duplicate records');
  test('recovers from partial failure');
});

describe('Engagement Scoring', () => {
  test('calculates score correctly');
  test('handles missing data');
  test('updates in real-time');
});

describe('Enquiry Routing', () => {
  test('matches practice areas');
  test('respects seniority rules');
  test('balances workload');
  test('handles no available barristers');
});

describe('Security', () => {
  test('enforces authentication');
  test('validates permissions');
  test('prevents SQL injection');
  test('sanitizes CSV input');
});
```

### Launch Checklist

#### Week 1: Foundation
- [ ] Initialize Next.js project
- [ ] Set up Supabase
- [ ] Create database schema
- [ ] Configure authentication
- [ ] Set up shadcn/ui

#### Week 2: Data Pipeline
- [ ] Build CSV parser
- [ ] Create import API
- [ ] Build export functionality
- [ ] Add error handling
- [ ] Test with real LEX files

#### Week 3: Core Features
- [ ] Enquiry management CRUD
- [ ] Barrister profiles
- [ ] Clerk assignments
- [ ] Basic routing algorithm
- [ ] Task system

#### Week 4: Dashboards
- [ ] Clerk dashboard
- [ ] Barrister dashboard
- [ ] Management reports
- [ ] Real-time updates
- [ ] Mobile responsive

#### Week 5: Intelligence
- [ ] Engagement scoring
- [ ] Conversion predictions
- [ ] Automated routing
- [ ] Performance tracking
- [ ] Alerts system

#### Week 6: Polish & Deploy
- [ ] UI refinements
- [ ] Performance optimization
- [ ] Security audit
- [ ] User training
- [ ] Production deployment

### Success Metrics

#### Technical Metrics
- CSV import success rate > 99%
- Page load time < 2 seconds
- Dashboard refresh < 500ms
- Zero data loss incidents

#### Business Metrics
- Response time to enquiries < 2 hours
- Conversion rate improvement > 20%
- Barrister engagement score > 75
- Clerk efficiency gain > 30%

#### User Adoption
- 100% clerk daily usage
- 80% barrister weekly usage
- < 5 support tickets per week
- User satisfaction > 4/5

### Risk Mitigation

#### LEX Integration Failure
- Manual CSV upload fallback
- Email notifications on failure
- Detailed error logging
- Daily reconciliation reports

#### Data Loss
- Hourly database backups
- Transaction logging
- Soft deletes only
- Audit trail on all changes

#### Performance Issues
- Database query optimization
- Implement caching layer
- Pagination on all lists
- Background job processing

#### User Resistance
- Phased rollout
- Champion user program
- Continuous training
- Quick wins visibility

### Maintenance & Evolution

#### Phase 2 Features (Months 4-6)
- AI-powered email drafting
- Client portal
- Mobile app
- Advanced analytics
- Integration with court systems

#### Ongoing Maintenance
- Weekly security updates
- Monthly performance review
- Quarterly feature releases
- Annual architecture review
- Continuous user feedback loop