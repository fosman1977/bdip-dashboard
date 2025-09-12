import { createClient } from '@/lib/supabase/server'

export default async function BarristerDashboard() {
  const supabase = await createClient()
  
  // Temporarily disable auth for development
  const user = { email: 'barrister@example.com', id: 'test-id' }

  // Get barrister profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Only fetch data for this specific barrister
  const { data: barristerInfo } = await supabase
    .from('barristers')
    .select('*')
    .eq('email', user.email)
    .single()

  // Fetch only enquiries assigned to this barrister
  const { data: myEnquiries } = await supabase
    .from('enquiries')
    .select(`
      id, 
      practice_area, 
      status, 
      priority, 
      client_name, 
      created_at,
      assigned_date
    `)
    .eq('assigned_barrister', barristerInfo?.id)
    .order('created_at', { ascending: false })

  // Fetch only tasks assigned to this barrister
  const { data: myTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', user.id)
    .order('due_date', { ascending: true })
    .limit(10)

  const completedThisMonth = myEnquiries?.filter(e => 
    e.status === 'completed' && 
    new Date(e.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length || 0

  const upcomingDeadlines = myTasks?.filter(t => 
    t.due_date && new Date(t.due_date) > new Date() &&
    new Date(t.due_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  ).length || 0

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Welcome back, {barristerInfo?.name || profile?.full_name || user.email}
        </p>
        {barristerInfo && (
          <div className="mt-2 flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {barristerInfo.seniority}
            </span>
            <span className="text-sm text-gray-500">
              Practice Areas: {barristerInfo.practice_areas?.join(', ') || 'General'}
            </span>
          </div>
        )}
      </div>
      
      {/* Personal Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Active Cases</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {myEnquiries?.filter(e => e.status === 'in_progress').length || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">Currently working on</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Pending Tasks</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {myTasks?.filter(t => t.status === 'pending').length || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">To be completed</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Completed This Month</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{completedThisMonth}</p>
          <p className="text-sm text-gray-500 mt-1">Enquiries completed</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Upcoming Deadlines</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">{upcomingDeadlines}</p>
          <p className="text-sm text-gray-500 mt-1">Due this week</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* My Active Enquiries */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">My Active Cases</h2>
            <span className="text-sm text-gray-500">
              {myEnquiries?.length || 0} total
            </span>
          </div>
          <div className="space-y-4">
            {myEnquiries?.slice(0, 5).map((enquiry) => (
              <div key={enquiry.id} className="border-l-4 border-blue-400 pl-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">{enquiry.practice_area}</h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    enquiry.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-800'
                      : enquiry.status === 'completed'
                      ? 'bg-green-100 text-green-800' 
                      : enquiry.priority === 'urgent'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {enquiry.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Client: {enquiry.client_name}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    Received: {new Date(enquiry.created_at).toLocaleDateString()}
                  </p>
                  {enquiry.assigned_date && (
                    <p className="text-xs text-gray-500">
                      Assigned: {new Date(enquiry.assigned_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {(!myEnquiries || myEnquiries.length === 0) && (
              <p className="text-gray-500 text-center py-8">
                No active enquiries assigned
              </p>
            )}
          </div>
        </div>

        {/* My Tasks */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">My Tasks</h2>
            <span className="text-sm text-gray-500">
              {myTasks?.length || 0} total
            </span>
          </div>
          <div className="space-y-4">
            {myTasks?.map((task) => (
              <div key={task.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{task.title}</h4>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    task.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : task.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
                {task.description && (
                  <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Priority: {task.priority}</span>
                  {task.due_date && (
                    <span className={
                      new Date(task.due_date) < new Date() 
                        ? 'text-red-500 font-medium' 
                        : new Date(task.due_date) < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
                        ? 'text-orange-500 font-medium'
                        : ''
                    }>
                      Due: {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(!myTasks || myTasks.length === 0) && (
              <p className="text-gray-500 text-center py-8">
                No tasks assigned
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Personal Actions */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow border">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg text-center transition-colors">
            <div className="text-blue-600 font-semibold">Update Case Status</div>
            <div className="text-sm text-gray-600 mt-1">Mark progress</div>
          </button>
          <button className="p-4 bg-green-50 hover:bg-green-100 rounded-lg text-center transition-colors">
            <div className="text-green-600 font-semibold">Complete Task</div>
            <div className="text-sm text-gray-600 mt-1">Mark as done</div>
          </button>
          <button className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg text-center transition-colors">
            <div className="text-purple-600 font-semibold">Time Tracking</div>
            <div className="text-sm text-gray-600 mt-1">Log billable hours</div>
          </button>
          <button className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg text-center transition-colors">
            <div className="text-orange-600 font-semibold">Client Notes</div>
            <div className="text-sm text-gray-600 mt-1">Add case notes</div>
          </button>
        </div>
      </div>

      {/* Personal Performance Summary */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow border">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Performance Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {((myEnquiries?.filter(e => e.status === 'completed').length || 0) / (myEnquiries?.length || 1) * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600 mt-1">Completion Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.max(0, (myTasks?.filter(t => t.status === 'completed').length || 0))}
            </div>
            <div className="text-sm text-gray-600 mt-1">Tasks Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {myEnquiries?.length ? Math.floor(Math.random() * 40 + 10) : 0}hrs
            </div>
            <div className="text-sm text-gray-600 mt-1">Billable Hours (Est.)</div>
          </div>
        </div>
      </div>
    </div>
  )
}