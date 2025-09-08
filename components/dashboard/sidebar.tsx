'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  Users, 
  ClipboardList, 
  BarChart3, 
  Settings, 
  Calendar,
  FileText,
  TrendingUp,
  UserCheck,
  Building,
  MessageSquare
} from 'lucide-react';

interface SidebarProps {
  userRole: 'clerk' | 'barrister' | 'admin';
}

const navigationConfig = {
  clerk: [
    { name: 'Dashboard', href: '/clerk', icon: BarChart3 },
    { name: 'Enquiry Queue', href: '/clerk/enquiries', icon: ClipboardList },
    { name: 'Assignments', href: '/clerk/assignments', icon: UserCheck },
    { name: 'Workload Monitor', href: '/clerk/workload', icon: Users },
  ],
  barrister: [
    { name: 'Dashboard', href: '/barrister', icon: BarChart3 },
    { name: 'My Tasks', href: '/barrister/tasks', icon: ClipboardList },
    { name: 'Performance', href: '/barrister/performance', icon: TrendingUp },
    { name: 'Calendar', href: '/barrister/calendar', icon: Calendar },
  ],
  admin: [
    { name: 'Dashboard', href: '/admin', icon: BarChart3 },
    { name: 'Reports', href: '/admin/reports', icon: FileText },
    { name: 'Barristers', href: '/admin/barristers', icon: Users },
    { name: 'Chambers', href: '/admin/chambers', icon: Building },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ],
};

export function DashboardSidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const navigation = navigationConfig[userRole] || [];

  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-200">
      <div className="flex items-center justify-center h-16 px-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">BDIP</h1>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
                          (item.href !== '/clerk' && item.href !== '/barrister' && item.href !== '/admin' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-700">
                {userRole.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate capitalize">
              {userRole}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}