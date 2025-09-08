# Agent Communication Protocols

## 🗣️ Inter-Agent Communication Standards

### Context Handoff Protocol

#### Format: Agent Output Summary
```markdown
## 📤 Handoff from [Agent Name]

### 🎯 Completed Objectives
- [Specific deliverable 1]
- [Specific deliverable 2]
- [Any additional outcomes]

### 🏗️ Technical Deliverables
**Files Created/Modified:**
- `path/to/file1.ext` - [Brief description]
- `path/to/file2.ext` - [Brief description]

**Key Code Patterns:**
- [Pattern/convention established]
- [Important technical decision made]

**Data Structures:**
```typescript
// Example interface/schema created
interface ExampleEntity {
  id: string;
  // ... other fields
}
```

### 🔗 Integration Points
**APIs Created:**
- `GET /api/endpoint` - [Purpose]
- `POST /api/endpoint` - [Purpose]

**Database Schema:**
- Tables: [table1, table2, ...]
- Key relationships: [description]

**Component Interfaces:**
- Props: [expected input format]
- Events: [what the component emits]

### ⚠️ Important Decisions Made
1. **[Decision Topic]**: [Choice made and reasoning]
2. **[Technical Choice]**: [Why this approach vs alternatives]

### 🚧 Known Limitations
- [Limitation 1 + suggested resolution]
- [Limitation 2 + workaround needed]

### 📋 Next Agent Requirements
**Context Needed:**
- [Specific information the next agent needs]
- [Files they should read first]
- [Key concepts they need to understand]

**Expected Inputs:**
- [What format/structure they'll receive]
- [Any validation requirements]

**Success Criteria:**
- [How to validate the integration works]
- [What the final outcome should achieve]

### ❓ Open Questions
- [Unresolved technical question]
- [Business requirement that needs clarification]
- [Design decision deferred to next agent]
```

## 🎭 Agent-Specific Communication Patterns

### 📊 To/From `csv-legal-integration`

#### Input Format (To CSV Agent)
```markdown
## 📥 CSV Integration Task

### Data Schema Context
**Database Tables:**
```sql
-- Relevant table structures
CREATE TABLE cases (
  id UUID PRIMARY KEY,
  -- ... columns
);
```

**Expected CSV Format:**
- Source: [LEX export / manual entry / etc.]
- Column mapping: [CSV column → Database field]
- Date formats: [DD/MM/YYYY / ISO / etc.]
- Currency handling: [GBP formatting requirements]

### Processing Requirements
- **Validation Rules**: [What constitutes valid data]
- **Error Handling**: [How to handle bad records]
- **Batch Size**: [Performance requirements]
- **Scheduling**: [When/how often to run]
```

#### Output Format (From CSV Agent)
```markdown
## 📤 CSV Integration Complete

### Processing Pipeline Created
**Files:**
- `lib/csv/parser.ts` - Core parsing logic
- `lib/csv/validators.ts` - UK-specific validation
- `app/api/import/route.ts` - API endpoint

### Integration Points
**API Endpoints:**
- `POST /api/import/csv` - Upload and process
- `GET /api/export/csv` - Generate download

**Data Flow:**
```
CSV Upload → Validation → Transform → Database → Confirmation
```

### Validation Schema
```typescript
interface CSVRecord {
  // Expected structure
}
```

### Error Handling
- Invalid date formats → [conversion strategy]
- Missing required fields → [default values / rejection]
- Duplicate records → [merge strategy / skip]
```

### 🏗️ To/From `supabase-legal-architect`

#### Input Format (To Database Agent)
```markdown
## 📥 Database Architecture Task

### Business Requirements
**Entities:**
- [Entity 1]: [Description, key attributes]
- [Entity 2]: [Description, relationships]

**User Roles:**
- [Role 1]: [Permissions, access patterns]
- [Role 2]: [Data they can see/modify]

**Security Requirements:**
- Multi-tenancy: [Chamber isolation needs]
- Audit trails: [What actions to log]
- Data retention: [Legal requirements]

### Performance Requirements
- Expected record volumes: [Rough estimates]
- Query patterns: [How data will be accessed]
- Reporting needs: [Aggregation requirements]

### Integration Context
**Existing Systems:**
- LEX integration: [What data comes/goes]
- External APIs: [Third-party connections]
```

#### Output Format (From Database Agent)
```markdown
## 📤 Database Architecture Complete

### Schema Implementation
**Migration Files:**
- `migrations/001_initial_schema.sql`
- `migrations/002_security_policies.sql`

**Core Tables:**
```sql
-- Key table structures
CREATE TABLE chambers (
  id UUID PRIMARY KEY,
  -- ...
);
```

### Security Implementation
**RLS Policies:**
- Chamber isolation: [How multi-tenancy works]
- Role-based access: [Who can see what]

**API Security:**
- Authentication: [How to verify users]
- Authorization: [Permission checking patterns]

### Performance Optimizations
**Indexes:**
- [Index 1]: `CREATE INDEX idx_name ON table(column)`
- [Index 2]: [Purpose and usage pattern]

**Query Patterns:**
```typescript
// Example optimized queries
const getCasesByUser = async (userId: string) => {
  // Implementation
}
```

### Integration Guides
**For CSV Agent:**
- Table mappings: [CSV columns → Database fields]
- Validation constraints: [What data rules to enforce]

**For UI Agent:**
- API endpoints: [Available operations]
- Data structures: [TypeScript interfaces]
```

### 🎨 To/From `general-purpose` (UI/General Dev)

#### Input Format (To General Purpose Agent)
```markdown
## 📥 UI Development Task

### API Context
**Available Endpoints:**
```typescript
// API interface definitions
interface CaseAPI {
  getCases(): Promise<Case[]>;
  createCase(data: CreateCaseRequest): Promise<Case>;
}
```

**Data Structures:**
```typescript
// Key interfaces for UI development
interface Case {
  id: string;
  title: string;
  // ... other fields
}
```

### Design Requirements
**User Workflows:**
1. [Primary workflow description]
2. [Secondary workflow description]

**UI Patterns:**
- Tables: [What data to display in lists]
- Forms: [What fields users need to input]
- Navigation: [How users move between sections]

### Technical Constraints
- Framework: Next.js 15 with TypeScript
- Styling: Tailwind CSS
- State management: [Redux / Context / etc.]
- Authentication: [How user sessions work]
```

#### Output Format (From General Purpose Agent)
```markdown
## 📤 UI Development Complete

### Components Created
**Core Components:**
- `components/CaseList.tsx` - [Description]
- `components/CaseForm.tsx` - [Description]
- `app/cases/page.tsx` - [Main case management page]

### State Management
**Pattern Used:** [Context API / Redux / etc.]
**State Structure:**
```typescript
interface AppState {
  // State shape
}
```

### Integration Implementation
**API Calls:**
```typescript
// How components fetch/update data
const useCases = () => {
  // Implementation
}
```

**Error Handling:**
- Network errors: [User feedback strategy]
- Validation errors: [Form error display]
- Loading states: [User experience during operations]

### User Experience Features
- Responsive design: [Mobile/desktop adaptations]
- Accessibility: [Screen reader support, keyboard navigation]
- Performance: [Loading optimizations, pagination]
```

## 🔄 Communication Flow Examples

### Example 1: New Feature Development
```
1. Coordinator → Database Agent: "Design schema for case tracking"
2. Database Agent → CSV Agent: "Here's the schema, build import pipeline"
3. CSV Agent → UI Agent: "Here are the APIs, build the interface"
4. UI Agent → Coordinator: "Feature complete, ready for testing"
```

### Example 2: Performance Issue Resolution
```
1. Coordinator → Database Agent: "Optimize slow case queries"
2. Database Agent → UI Agent: "Updated API with pagination, adjust components"
3. UI Agent → CSV Agent: "New pagination affects bulk operations"
4. CSV Agent → Coordinator: "All systems updated and tested"
```

### Example 3: Integration Problem
```
1. UI Agent → Coordinator: "CSV import fails with validation errors"
2. Coordinator → CSV Agent: "Debug validation logic"
3. CSV Agent → Database Agent: "Schema constraints too strict"
4. Database Agent → UI Agent: "Relaxed constraints, update error messages"
```

## 🎯 Quality Gates

### Before Handoff Checklist
- [ ] All deliverables documented
- [ ] Integration points clearly defined
- [ ] Code follows project conventions
- [ ] Tests pass (if applicable)
- [ ] No breaking changes to existing work
- [ ] Next steps clearly outlined

### Integration Validation
- [ ] APIs work as documented
- [ ] Data flows correctly between components
- [ ] Error handling works end-to-end
- [ ] Performance meets requirements
- [ ] Security constraints respected

## 📞 Emergency Communication

### Blocking Issues Protocol
1. **Immediate**: Document the blocker clearly
2. **Escalate**: Tag coordinator with `@urgent`
3. **Context**: Provide full context + attempted solutions
4. **Alternatives**: Suggest workarounds if possible

### Critical Decision Points
- **Technical Architecture**: Database schema changes
- **User Experience**: Major UI/UX decisions
- **Security**: Authentication/authorization approaches
- **Performance**: Scalability trade-offs