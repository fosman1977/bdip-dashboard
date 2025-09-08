# BDIP Project Master Coordinator

## 🎯 Current Project Analysis
- **Platform**: Next.js 15 with TypeScript
- **Styling**: Tailwind CSS
- **State**: Fresh project (starter template)
- **Architecture**: Ready for agent-coordinated development

## 🤖 Available Specialized Agents

### 1. CSV Integration Specialist (`csv-legal-integration`)
**Expertise**: LEX system integration, UK data formats, Papa Parse, ETL pipelines
- CSV import/export operations
- UK date/currency validation
- Batch processing workflows
- Data quality assurance

### 2. Database Architect (`supabase-legal-architect`)  
**Expertise**: PostgreSQL/Supabase schemas, legal practice management
- Table schema design
- Row Level Security policies
- Temporal data patterns
- Multi-tenant architectures
- Migration scripts

### 3. Dashboard UI Builder (`general-purpose`)
**Expertise**: React/Next.js components, data visualization
- Component development
- State management
- UI/UX implementation
- Data binding

## 🎛️ Coordination Framework

### Phase 1: Foundation Setup
```
Order: Database → CSV → UI
Context Flow: Schema → Data Structure → Display Layer
```

### Phase 2: Integration
```
Order: API → Data Flow → Components
Context Flow: Endpoints → Processing → Visualization
```

### Phase 3: Refinement
```
Order: Testing → Optimization → Documentation
Context Flow: Validation → Performance → Knowledge
```

## 📋 Task Distribution Matrix

| Task Type | Primary Agent | Secondary Support | Context Needed |
|-----------|--------------|------------------|----------------|
| Schema Design | `supabase-legal-architect` | - | Business requirements, entity relationships |
| CSV Processing | `csv-legal-integration` | `supabase-legal-architect` | Schema structure, data formats |
| API Endpoints | `supabase-legal-architect` | `csv-legal-integration` | Data operations, security requirements |
| UI Components | `general-purpose` | - | API specifications, design requirements |
| Data Visualization | `general-purpose` | `csv-legal-integration` | Data structure, user workflows |

## 🔄 Decision Tree for Agent Selection

### When to use `supabase-legal-architect`:
- Designing database schemas
- Implementing RLS policies
- Creating migration scripts
- Optimizing legal data queries
- Multi-tenant setup

### When to use `csv-legal-integration`:
- Processing LEX exports/imports
- Handling UK data formats
- Building ETL pipelines
- CSV validation/transformation
- Batch operations

### When to use `general-purpose`:
- Building React components
- State management setup
- API integration
- Search functionality
- General development tasks

## 🎯 Current Project State
**Status**: Initial Next.js setup complete
**Next Priority**: Define project scope and first milestone

## 🚀 Recommended Next Steps

### Step 1: Project Scope Definition
**Agent**: Coordinator (You)
**Action**: Define the specific BDIP features to build
**Output**: Feature specification document

### Step 2: Database Foundation
**Agent**: `supabase-legal-architect`
**Context**: Feature specifications, legal data requirements
**Action**: Design initial schema for core entities
**Output**: Database schema + migration scripts

### Step 3: CSV Integration Setup
**Agent**: `csv-legal-integration`
**Context**: Database schema, LEX export formats
**Action**: Build import/export pipeline
**Output**: CSV processing components + validation

### Step 4: UI Foundation
**Agent**: `general-purpose`
**Context**: API endpoints, data structure
**Action**: Create dashboard components
**Output**: React components + routing

## 💬 Agent Communication Protocol

### Context Handoff Format:
```markdown
## Context from [Previous Agent]
- **Deliverables**: [What was built]
- **Key Decisions**: [Important choices made]
- **Data Structures**: [Schema/types created]
- **Dependencies**: [What the next agent needs to know]
- **Open Questions**: [Unresolved issues]
```

### Task Request Format:
```markdown
## Task for [Agent Name]
- **Objective**: [What needs to be accomplished]
- **Context**: [Relevant background from previous work]
- **Constraints**: [Technical/business limitations]
- **Expected Output**: [Specific deliverables]
- **Success Criteria**: [How to measure completion]
```

## 📊 Progress Tracking Template

### Project Milestone: [Name]
- [ ] Database Schema Complete
- [ ] CSV Integration Ready
- [ ] API Endpoints Functional
- [ ] UI Components Built
- [ ] Integration Testing Passed
- [ ] Documentation Updated

---

## 🎯 Quick Start: Which Agent to Use Next?

**Answer these questions:**

1. **What are you building specifically?** (e.g., case management, client dashboard, report generator)
2. **What data sources exist?** (e.g., LEX exports, existing databases, manual entry)
3. **Who are the users?** (e.g., barristers, clerks, administrators)
4. **What's the primary workflow?** (e.g., import → process → display → export)

**Based on your answers, I'll recommend the optimal agent sequence and provide specific task briefs.**