/**
 * Role-Based Access Control (RBAC) utilities for BDIP
 * Defines permissions and access control logic for UK Barristers' Chambers
 */

export type UserRole = 'admin' | 'clerk' | 'barrister' | 'read_only'

export type Permission = 
  // User and profile management
  | 'manage_users'
  | 'invite_users'
  | 'view_user_profiles'
  | 'update_own_profile'
  | 'update_user_profiles'
  
  // Enquiry management
  | 'read_enquiries'
  | 'read_own_enquiries'
  | 'write_enquiries'
  | 'assign_enquiries'
  | 'delete_enquiries'
  
  // Client management
  | 'read_clients'
  | 'write_clients'
  | 'delete_clients'
  | 'manage_client_relationships'
  
  // Barrister management
  | 'read_barristers'
  | 'write_barristers'
  | 'manage_barrister_assignments'
  | 'view_barrister_performance'
  
  // Task management
  | 'read_tasks'
  | 'read_own_tasks'
  | 'write_own_tasks'
  | 'assign_tasks'
  | 'manage_all_tasks'
  
  // Reports and analytics
  | 'view_reports'
  | 'view_own_analytics'
  | 'view_chamber_analytics'
  | 'export_data'
  
  // System administration
  | 'manage_system_settings'
  | 'view_audit_logs'
  | 'manage_chambers'
  | 'backup_data'

/**
 * Role permission matrix
 * Defines what each role can do by default
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    // Full system access
    'manage_users',
    'invite_users',
    'view_user_profiles',
    'update_own_profile',
    'update_user_profiles',
    'read_enquiries',
    'write_enquiries',
    'assign_enquiries',
    'delete_enquiries',
    'read_clients',
    'write_clients',
    'delete_clients',
    'manage_client_relationships',
    'read_barristers',
    'write_barristers',
    'manage_barrister_assignments',
    'view_barrister_performance',
    'read_tasks',
    'assign_tasks',
    'manage_all_tasks',
    'view_reports',
    'view_chamber_analytics',
    'export_data',
    'manage_system_settings',
    'view_audit_logs',
    'manage_chambers',
    'backup_data'
  ],
  
  clerk: [
    // Operational management
    'view_user_profiles',
    'update_own_profile',
    'read_enquiries',
    'write_enquiries',
    'assign_enquiries',
    'read_clients',
    'write_clients',
    'manage_client_relationships',
    'read_barristers',
    'manage_barrister_assignments',
    'view_barrister_performance',
    'read_tasks',
    'assign_tasks',
    'view_reports',
    'view_chamber_analytics'
  ],
  
  barrister: [
    // Self-service and own work management
    'update_own_profile',
    'read_own_enquiries',
    'read_clients',
    'read_barristers',
    'read_own_tasks',
    'write_own_tasks',
    'view_own_analytics'
  ],
  
  read_only: [
    // View-only access
    'update_own_profile',
    'read_enquiries',
    'read_clients',
    'read_barristers',
    'read_tasks',
    'view_reports'
  ]
}

/**
 * Resource-based permissions
 * Additional context-aware permissions based on resource ownership
 */
export interface ResourceContext {
  resource_type: 'enquiry' | 'client' | 'task' | 'barrister' | 'user'
  resource_id: string
  owner_id?: string
  assigned_clerk_id?: string
  assigned_barrister_id?: string
  chambers_id?: string
}

/**
 * Check if user has a specific permission based on their role
 */
export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || []
  return rolePermissions.includes(permission)
}

/**
 * Check if user can access a specific resource
 */
export function canAccessResource(
  userRole: UserRole,
  userId: string,
  permission: Permission,
  context?: ResourceContext
): boolean {
  // Admin can access everything
  if (userRole === 'admin') {
    return true
  }

  // Check basic role permissions first
  if (!hasPermission(userRole, permission)) {
    return false
  }

  // If no context provided, rely on role permissions
  if (!context) {
    return true
  }

  // Resource-specific access control
  switch (context.resource_type) {
    case 'enquiry':
      return canAccessEnquiry(userRole, userId, permission, context)
      
    case 'task':
      return canAccessTask(userRole, userId, permission, context)
      
    case 'barrister':
      return canAccessBarrister(userRole, userId, permission, context)
      
    case 'user':
      return canAccessUser(userRole, userId, permission, context)
      
    default:
      return hasPermission(userRole, permission)
  }
}

/**
 * Enquiry-specific access control
 */
function canAccessEnquiry(
  userRole: UserRole,
  userId: string,
  permission: Permission,
  context: ResourceContext
): boolean {
  // Clerks can access all enquiries in their operations
  if (userRole === 'clerk') {
    return hasPermission(userRole, permission)
  }

  // Barristers can only access their own assigned enquiries
  if (userRole === 'barrister') {
    if (permission === 'read_own_enquiries') {
      return context.assigned_barrister_id === userId
    }
    return false
  }

  return hasPermission(userRole, permission)
}

/**
 * Task-specific access control
 */
function canAccessTask(
  userRole: UserRole,
  userId: string,
  permission: Permission,
  context: ResourceContext
): boolean {
  // Barristers can only access their own tasks
  if (userRole === 'barrister') {
    if (permission === 'read_own_tasks' || permission === 'write_own_tasks') {
      return context.assigned_barrister_id === userId
    }
    return false
  }

  return hasPermission(userRole, permission)
}

/**
 * Barrister-specific access control
 */
function canAccessBarrister(
  userRole: UserRole,
  userId: string,
  permission: Permission,
  context: ResourceContext
): boolean {
  // Barristers can view their own performance
  if (userRole === 'barrister' && permission === 'view_own_analytics') {
    return context.resource_id === userId
  }

  return hasPermission(userRole, permission)
}

/**
 * User-specific access control
 */
function canAccessUser(
  userRole: UserRole,
  userId: string,
  permission: Permission,
  context: ResourceContext
): boolean {
  // Users can always update their own profile
  if (permission === 'update_own_profile') {
    return context.resource_id === userId
  }

  return hasPermission(userRole, permission)
}

/**
 * Get all permissions for a user role
 */
export function getRolePermissions(userRole: UserRole): Permission[] {
  return ROLE_PERMISSIONS[userRole] || []
}

/**
 * Check if a role can perform an action on another role
 * (e.g., admin can manage clerk, but clerk cannot manage admin)
 */
export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  if (managerRole === 'admin') {
    return true // Admin can manage everyone
  }

  if (managerRole === 'clerk') {
    return ['barrister', 'read_only'].includes(targetRole)
  }

  return false // Other roles cannot manage users
}

/**
 * Role hierarchy for determining access levels
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  clerk: 3,
  barrister: 2,
  read_only: 1
}

/**
 * Check if one role has higher or equal access than another
 */
export function hasHigherOrEqualAccess(userRole: UserRole, targetRole: UserRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] || 0
  const targetLevel = ROLE_HIERARCHY[targetRole] || 0
  return userLevel >= targetLevel
}

/**
 * Permission groups for UI organization
 */
export const PERMISSION_GROUPS = {
  'User Management': [
    'manage_users',
    'invite_users',
    'view_user_profiles',
    'update_own_profile',
    'update_user_profiles'
  ] as Permission[],
  
  'Case Management': [
    'read_enquiries',
    'read_own_enquiries',
    'write_enquiries',
    'assign_enquiries',
    'delete_enquiries'
  ] as Permission[],
  
  'Client Relations': [
    'read_clients',
    'write_clients',
    'delete_clients',
    'manage_client_relationships'
  ] as Permission[],
  
  'Task Management': [
    'read_tasks',
    'read_own_tasks',
    'write_own_tasks',
    'assign_tasks',
    'manage_all_tasks'
  ] as Permission[],
  
  'Analytics & Reports': [
    'view_reports',
    'view_own_analytics',
    'view_chamber_analytics',
    'export_data'
  ] as Permission[],
  
  'Administration': [
    'manage_system_settings',
    'view_audit_logs',
    'manage_chambers',
    'backup_data'
  ] as Permission[]
}

/**
 * Get human-readable permission names
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'manage_users': 'Manage Users',
  'invite_users': 'Invite New Users',
  'view_user_profiles': 'View User Profiles',
  'update_own_profile': 'Update Own Profile',
  'update_user_profiles': 'Update User Profiles',
  'read_enquiries': 'View All Enquiries',
  'read_own_enquiries': 'View Own Enquiries',
  'write_enquiries': 'Create & Edit Enquiries',
  'assign_enquiries': 'Assign Enquiries',
  'delete_enquiries': 'Delete Enquiries',
  'read_clients': 'View Clients',
  'write_clients': 'Create & Edit Clients',
  'delete_clients': 'Delete Clients',
  'manage_client_relationships': 'Manage Client Relationships',
  'read_barristers': 'View Barristers',
  'write_barristers': 'Create & Edit Barristers',
  'manage_barrister_assignments': 'Manage Barrister Assignments',
  'view_barrister_performance': 'View Barrister Performance',
  'read_tasks': 'View All Tasks',
  'read_own_tasks': 'View Own Tasks',
  'write_own_tasks': 'Create & Edit Own Tasks',
  'assign_tasks': 'Assign Tasks',
  'manage_all_tasks': 'Manage All Tasks',
  'view_reports': 'View Reports',
  'view_own_analytics': 'View Own Analytics',
  'view_chamber_analytics': 'View Chamber Analytics',
  'export_data': 'Export Data',
  'manage_system_settings': 'Manage System Settings',
  'view_audit_logs': 'View Audit Logs',
  'manage_chambers': 'Manage Chambers',
  'backup_data': 'Backup Data'
}

/**
 * Role display names
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  clerk: 'Clerk',
  barrister: 'Barrister',
  read_only: 'Read Only'
}

/**
 * Role descriptions
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full system access including user management and system configuration',
  clerk: 'Operational management of enquiries, clients, and barrister assignments',
  barrister: 'Access to own cases, tasks, and performance analytics',
  read_only: 'View-only access to enquiries, clients, and reports'
}