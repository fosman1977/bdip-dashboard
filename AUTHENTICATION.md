# BDIP Authentication System

Complete authentication system implementation for the Business Development Intelligence Platform (BDIP) - a UK barristers' chambers management system.

## Overview

This authentication system provides:

- **Role-based Access Control (RBAC)** with four roles: admin, clerk, barrister, read_only
- **Invitation-based signup** for chambers to manage their members
- **Comprehensive audit trails** for all authentication events
- **Security features** including rate limiting, account lockouts, and failed login tracking
- **Profile management** with chambers-specific metadata
- **Integration with existing security utilities**

## Architecture

### Database Schema

The authentication system adds several new tables to the existing database:

#### profiles
Enhanced user profiles linking to Supabase auth.users with:
- Role-based access control
- Account status and security settings
- Invitation system support
- Chambers-specific metadata
- Profile completeness tracking

#### auth_audit_log
Comprehensive audit trail for authentication events:
- Sign in/out events
- Password changes
- Failed login attempts
- Account lockouts
- Profile updates

#### profile_audit_log
Detailed change tracking for profile modifications:
- Field-level change tracking
- User context and IP tracking
- Change reasons and notes

### Security Features

1. **Account Lockout Protection**
   - Progressive lockout duration (5 min → 30 min → 60 min)
   - Failed attempt tracking
   - Automatic unlock after timeout

2. **Rate Limiting**
   - IP-based rate limiting on all auth endpoints
   - Different limits for different operations
   - Configurable via environment variables

3. **Password Security**
   - Minimum 8 characters with complexity requirements
   - Password change tracking
   - Force password change capability

4. **Comprehensive Logging**
   - All authentication events logged
   - IP address and user agent tracking
   - Success and failure tracking

## API Endpoints

### Authentication Routes

#### POST /api/auth/signup
Create new user account (with optional invitation)

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "full_name": "John Smith",
  "role": "barrister",
  "invitation_token": "optional-invitation-token"
}
```

#### POST /api/auth/signin
Authenticate user and create session

```json
{
  "email": "user@example.com", 
  "password": "securePassword123",
  "remember_me": true
}
```

#### POST /api/auth/signout
Sign out current user

#### GET /api/auth/profile
Get current user profile

#### PUT /api/auth/profile
Update current user profile

```json
{
  "full_name": "Updated Name",
  "phone": "+44 123 456 7890",
  "notification_preferences": {
    "email_notifications": true
  }
}
```

#### POST /api/auth/password/reset
Request password reset

```json
{
  "email": "user@example.com",
  "redirect_to": "https://your-app.com/auth/reset-password"
}
```

#### PUT /api/auth/password/update
Change password (authenticated users)

```json
{
  "current_password": "oldPassword",
  "new_password": "newSecurePassword123"
}
```

### Admin Routes

#### POST /api/auth/invite
Invite new user (admin only)

```json
{
  "email": "newuser@example.com",
  "full_name": "Jane Doe", 
  "role": "clerk",
  "chambers_id": "optional-chambers-id",
  "message": "Welcome to our chambers"
}
```

#### GET /api/auth/invite
List pending invitations (admin only)

## Role-Based Access Control

### Roles

1. **admin** - Full system access
2. **clerk** - Operational management of enquiries, clients, assignments
3. **barrister** - Access to own cases, tasks, and performance data
4. **read_only** - View-only access to reports and data

### Permission System

The RBAC system uses a comprehensive permission model:

```typescript
// Example permission check
import { hasPermission, canAccessResource } from '@/lib/auth/rbac'

// Basic role permission
const canManageUsers = hasPermission(userRole, 'manage_users')

// Context-aware resource access
const canViewEnquiry = canAccessResource(
  userRole, 
  userId, 
  'read_enquiries',
  { 
    resource_type: 'enquiry',
    resource_id: enquiryId,
    assigned_barrister_id: assignedBarristerId
  }
)
```

## Client-Side Integration

### Auth Context Provider

```tsx
import { AuthProvider, useAuth } from '@/lib/auth/auth-context'

function App({ children }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}

function Dashboard() {
  const { user, profile, signIn, signOut, loading } = useAuth()
  
  if (loading) return <div>Loading...</div>
  if (!user) return <SignInForm />
  
  return <DashboardContent />
}
```

### Permission Hooks

```tsx
import { useRole, usePermission } from '@/lib/auth/auth-context'

function AdminPanel() {
  const isAdmin = useRole('admin')
  const canManageUsers = usePermission('manage_users')
  
  if (!isAdmin) return <Unauthorized />
  
  return (
    <div>
      <h1>Admin Panel</h1>
      {canManageUsers && <UserManagement />}
    </div>
  )
}
```

## Middleware Protection

The authentication middleware automatically protects routes:

```typescript
// middleware.ts handles:
// - Session validation
// - Role-based route protection
// - Account status checks
// - Password change requirements
// - Onboarding requirements
```

### Protected Route Patterns

- `/admin/*` - Admin only
- `/enquiries/*` - Clerk and above
- `/dashboard/*` - Any authenticated user
- `/api/auth/invite` - Admin only
- `/api/enquiries/*` - Clerk and above

## Database Functions

### Authentication Functions

1. **handle_new_user()** - Automatically creates profile on signup
2. **handle_profile_update()** - Tracks profile changes
3. **log_auth_event()** - Logs authentication events
4. **check_user_permission()** - Server-side permission checking
5. **create_user_invitation()** - Creates secure user invitations

### RLS Policies

Row Level Security policies ensure data isolation:

```sql
-- Users can only access their own profile
CREATE POLICY "Users can read own profile" ON profiles
FOR SELECT USING (auth.uid() = id);

-- Admins can access all profiles  
CREATE POLICY "Admins can read all profiles" ON profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
);
```

## Setup Instructions

### 1. Database Migration

Run the authentication migration:

```bash
# Apply the authentication system migration
supabase migration up 20250109000000_create_authentication_system
```

### 2. Environment Configuration

Copy and configure environment variables:

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

### 3. Initial Admin User

After setting up, create your first admin user via the Supabase dashboard or run:

```sql
-- Insert initial admin profile (replace with actual user ID from auth.users)
INSERT INTO public.profiles (
  id, email, full_name, role, is_active, is_verified, profile_completed
) VALUES (
  'your-user-id-from-auth-users',
  'admin@yourchambers.com',
  'Admin User',
  'admin',
  true,
  true,
  true
);
```

## Usage Examples

### Sign Up Flow

```typescript
import { authService } from '@/lib/auth/auth-service'

const handleSignUp = async (data) => {
  const result = await authService.signUp({
    email: data.email,
    password: data.password,
    full_name: data.fullName,
    role: 'barrister',
    invitation_token: data.invitationToken
  })
  
  if (result.success) {
    // Handle success (may require email confirmation)
    router.push('/auth/check-email')
  } else {
    // Handle error
    setError(result.error.message)
  }
}
```

### Invitation Flow

```typescript
// Admin invites new user
const handleInvite = async (userData) => {
  const result = await authService.inviteUser({
    email: userData.email,
    full_name: userData.fullName,
    role: userData.role,
    chambers_id: currentUser.chambers_id
  })
  
  if (result.success) {
    // Send invitation email with result.data.invitation_url
    await sendInvitationEmail(userData.email, result.data.invitation_url)
  }
}
```

### Server-Side Authentication

```typescript
import { getAuthenticatedUser } from '@/lib/auth/auth-utils'

export async function GET(request: NextRequest) {
  const { user, profile, error } = await getAuthenticatedUser()
  
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // User is authenticated, proceed with logic
  return NextResponse.json({ data: 'protected data' })
}
```

## Security Considerations

1. **Environment Variables**: Keep service role keys secure
2. **Rate Limiting**: Adjust limits based on expected usage
3. **Email Verification**: Enable in production Supabase settings
4. **Session Management**: Configure appropriate timeouts
5. **Audit Logs**: Monitor for suspicious activity
6. **Password Policies**: Enforce strong passwords in UI

## Integration with Existing System

This authentication system integrates seamlessly with the existing BDIP codebase:

- Uses existing security utilities (`lib/security/*`)
- Extends existing database schema
- Works with existing CSV import/export system
- Maintains existing business logic patterns

The system is production-ready and follows security best practices for UK legal software systems.