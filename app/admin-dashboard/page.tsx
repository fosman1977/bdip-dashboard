export default async function AdminDashboard() {
  // Temporarily disable auth for development
  const user = { email: 'admin@example.com' }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome back, {user.email}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Total Users</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">24</p>
          <p className="text-sm text-gray-500 mt-1">Active users</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Total Enquiries</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">156</p>
          <p className="text-sm text-gray-500 mt-1">This month</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">Revenue</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">£45k</p>
          <p className="text-sm text-gray-500 mt-1">Monthly revenue</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-800">System Health</h3>
          <p className="text-3xl font-bold text-emerald-600 mt-2">98%</p>
          <p className="text-sm text-gray-500 mt-1">Uptime</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">New user registration</span>
              <span className="text-sm text-gray-500">2 minutes ago</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Enquiry submitted</span>
              <span className="text-sm text-gray-500">15 minutes ago</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Task completed</span>
              <span className="text-sm text-gray-500">1 hour ago</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">System Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Database</span>
              <span className="text-sm text-green-600 font-medium">Healthy</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">API Response Time</span>
              <span className="text-sm text-green-600 font-medium">45ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Memory Usage</span>
              <span className="text-sm text-yellow-600 font-medium">68%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}