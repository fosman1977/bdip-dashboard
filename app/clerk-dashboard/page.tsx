import { createClient } from '@/lib/supabase/server'

export default async function ClerkDashboard() {
  const supabase = await createClient()
  
  // Temporarily disable auth for development
  const user = { email: 'clerk@example.com' }

  // Fetch clerk-specific data
  const { data: enquiries } = await supabase
    .from('enquiries')
    .select(`
      id, 
      practice_area, 
      status, 
      priority, 
      client_name, 
      created_at,
      assigned_barrister:barristers(name)
    `)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: barristers } = await supabase
    .from('barristers')
    .select('id, name, seniority, practice_areas')
    .order('name')

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Clerk Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage enquiries and barrister assignments</p>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Pending Assignments</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {enquiries?.filter(e => e.status === 'new').length || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">Awaiting assignment</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Active Cases</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {enquiries?.filter(e => e.status === 'in_progress').length || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">In progress</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Available Barristers</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{barristers?.length || 0}</p>
          <p className="text-sm text-gray-500 mt-1">Ready for assignments</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Urgent Matters</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">
            {enquiries?.filter(e => e.priority === 'urgent').length || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">Require attention</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Enquiries */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Recent Enquiries</h2>
            <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              View All
            </button>
          </div>
          <div className="space-y-4">
            {enquiries?.map((enquiry) => (
              <div key={enquiry.id} className="border-l-4 border-blue-400 pl-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">{enquiry.practice_area}</h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    enquiry.status === 'new' 
                      ? 'bg-orange-100 text-orange-800'
                      : enquiry.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {enquiry.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Client: {enquiry.client_name}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    {new Date(enquiry.created_at).toLocaleDateString()}
                  </p>
                  {enquiry.assigned_barrister && (
                    <p className="text-xs text-gray-600">
                      Assigned: {enquiry.assigned_barrister.name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Barrister Workload */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Barrister Workload</h2>
            <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Manage
            </button>
          </div>
          <div className="space-y-4">
            {barristers?.map((barrister) => (
              <div key={barrister.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{barrister.name}</h4>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    barrister.seniority === 'QC'
                      ? 'bg-purple-100 text-purple-800'
                      : barrister.seniority === 'Junior'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {barrister.seniority}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  <p>Practice Areas: {barrister.practice_areas?.join(', ') || 'General'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span>Current Load:</span>
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${Math.random() * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs">{Math.floor(Math.random() * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow border">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg text-center transition-colors">
            <div className="text-blue-600 font-semibold">Assign Enquiry</div>
            <div className="text-sm text-gray-600 mt-1">Match cases to barristers</div>
          </button>
          <button className="p-4 bg-green-50 hover:bg-green-100 rounded-lg text-center transition-colors">
            <div className="text-green-600 font-semibold">View Queue</div>
            <div className="text-sm text-gray-600 mt-1">Check pending matters</div>
          </button>
          <button className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg text-center transition-colors">
            <div className="text-purple-600 font-semibold">Generate Reports</div>
            <div className="text-sm text-gray-600 mt-1">Business analytics</div>
          </button>
          <button className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg text-center transition-colors">
            <div className="text-orange-600 font-semibold">Manage Clients</div>
            <div className="text-sm text-gray-600 mt-1">Client database</div>
          </button>
        </div>
      </div>
    </div>
  )
}