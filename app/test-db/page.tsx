import { createClient } from '../../lib/supabase/server'

export default async function TestDBPage() {
  try {
    const supabase = await createClient()
    
    // Check what tables actually exist
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_table_names')
      .limit(50)
    
    // If that RPC doesn't exist, try getting table info from information_schema
    let tablesList = []
    if (tablesError) {
      // Try a different approach - just test known tables
      const knownTables = ['profiles', 'barristers', 'enquiries', 'clients', 'clerks', 'tasks', 'csv_imports', 'auth_audit_log']
      const tableTests = []
      
      for (const tableName of knownTables) {
        try {
          const { error } = await supabase.from(tableName).select('*').limit(0)
          if (!error) {
            tablesList.push({ table_name: tableName, exists: true })
          }
        } catch (e) {
          tablesList.push({ table_name: tableName, exists: false, error: e.message })
        }
      }
    }
    
    // Test basic connection to existing tables
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .limit(5)
    
    const { data: barristers, error: barristersError } = await supabase
      .from('barristers')
      .select('id, name, email, seniority')
      .limit(5)
    
    const { data: enquiries, error: enquiriesError } = await supabase
      .from('enquiries')
      .select('id, practice_area, status')
      .limit(5)
    
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Database Connection Test</h1>
        
        <div className="space-y-6">
          {/* Tables List */}
          <div className="border p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Database Tables</h2>
            {tables ? (
              <div>
                <p className="text-green-600 mb-2">✅ Found {tables.length} tables</p>
                {tables.map((table, i) => (
                  <div key={i} className="text-sm border-l-2 pl-2 mt-1">
                    {table.table_name}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-blue-600 mb-2">📋 Testing known tables</p>
                {tablesList.map((table, i) => (
                  <div key={i} className="text-sm border-l-2 pl-2 mt-1">
                    {table.exists ? '✅' : '❌'} {table.table_name}
                    {table.error && <span className="text-red-500 ml-2">({table.error})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Profiles Test */}
          <div className="border p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Profiles Table</h2>
            {profilesError ? (
              <p className="text-red-600">Error: {profilesError.message}</p>
            ) : (
              <div>
                <p className="text-green-600 mb-2">✅ Connected successfully</p>
                <p className="text-sm text-gray-600">Found {profiles?.length || 0} profiles</p>
                {profiles?.map((profile) => (
                  <div key={profile.id} className="text-sm border-l-2 pl-2 mt-1">
                    {profile.email} - {profile.full_name} ({profile.role})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Barristers Test */}
          <div className="border p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Barristers Table</h2>
            {barristersError ? (
              <p className="text-red-600">Error: {barristersError.message}</p>
            ) : (
              <div>
                <p className="text-green-600 mb-2">✅ Connected successfully</p>
                <p className="text-sm text-gray-600">Found {barristers?.length || 0} barristers</p>
                {barristers?.map((barrister) => (
                  <div key={barrister.id} className="text-sm border-l-2 pl-2 mt-1">
                    {barrister.name} - {barrister.email} ({barrister.seniority})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enquiries Test */}
          <div className="border p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Enquiries Table</h2>
            {enquiriesError ? (
              <p className="text-red-600">Error: {enquiriesError.message}</p>
            ) : (
              <div>
                <p className="text-green-600 mb-2">✅ Connected successfully</p>
                <p className="text-sm text-gray-600">Found {enquiries?.length || 0} enquiries</p>
                {enquiries?.map((enquiry) => (
                  <div key={enquiry.id} className="text-sm border-l-2 pl-2 mt-1">
                    {enquiry.practice_area} ({enquiry.status})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  } catch (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Database Connection Test</h1>
        <div className="border p-4 rounded-lg border-red-200 bg-red-50">
          <p className="text-red-600">❌ Connection failed:</p>
          <p className="text-sm text-red-500 mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    )
  }
}