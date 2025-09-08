import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // For demo purposes, we'll use mock data when Supabase is not configured
  let profile = { role: 'clerk' as const, name: 'Demo User' };
  
  try {
    const supabase = createServerComponentClient({ cookies });
    
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      // For demo, allow access without auth
      console.log('Demo mode: No authentication configured');
    } else {
      // Get user profile with role information
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role, name')
        .eq('id', session.user.id)
        .single();

      if (userProfile) {
        profile = userProfile;
      }
    }
  } catch (error) {
    console.log('Running in demo mode without Supabase');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <DashboardSidebar userRole={profile.role} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardHeader 
          userName={profile.name}
          userRole={profile.role}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}