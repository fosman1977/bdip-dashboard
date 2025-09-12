'use client'

import { useState } from 'react'
import { useRealtimeData } from '../../lib/hooks/use-realtime-data'
import { useOptimisticMutations } from '../../lib/hooks/use-optimistic-mutations'
import { useMemorySafeEffect } from '../../lib/hooks/use-memory-safe-effect'

interface Enquiry {
  id: string
  practice_area: string
  status: string
  client_name?: string
  estimated_value?: number
  created_at: string
}

interface RealTimeEnquiriesProps {
  barrister_id?: string // For barrister role isolation
  show_all?: boolean // For admin/clerk roles
}

export function RealTimeEnquiries({ barrister_id, show_all = false }: RealTimeEnquiriesProps) {
  const [localEnquiries, setLocalEnquiries] = useState<Enquiry[]>([])
  const { safeAsync, registerCleanup, isMounted } = useMemorySafeEffect()

  // Set up real-time data with proper filtering
  const filter = barrister_id && !show_all 
    ? { assigned_barrister_id: barrister_id } 
    : undefined

  const { 
    data: enquiries, 
    loading, 
    error, 
    lastUpdated,
    refresh 
  } = useRealtimeData<Enquiry>({
    table: 'enquiries',
    select: 'id, practice_area, status, client_name, estimated_value, created_at',
    filter,
    enabled: true
  })

  // Set up optimistic mutations
  const {
    loading: mutating,
    error: mutationError,
    updateOptimistic
  } = useOptimisticMutations<Enquiry>({
    table: 'enquiries',
    onSuccess: (data) => {
      console.log('Enquiry updated successfully:', data)
    },
    onError: (error) => {
      console.error('Failed to update enquiry:', error)
    }
  })

  // Update status with optimistic UI
  const updateEnquiryStatus = async (id: string, newStatus: string) => {
    await safeAsync(
      () => updateOptimistic(
        id,
        { status: newStatus },
        // Optimistic update - immediate UI change
        (updates) => {
          setLocalEnquiries(prev => 
            prev.map(enquiry => 
              enquiry.id === id ? { ...enquiry, ...updates } : enquiry
            )
          )
        },
        // Revert function if error occurs
        (originalData) => {
          setLocalEnquiries(prev => 
            prev.map(enquiry => 
              enquiry.id === id ? { ...enquiry, ...originalData } : enquiry
            )
          )
        }
      ),
      undefined, // onSuccess handled by optimistic mutations hook
      (error) => console.error('Failed to update status:', error)
    )
  }

  // Memory cleanup registration
  registerCleanup(() => {
    console.log('RealTimeEnquiries component cleanup')
  })

  if (loading) {
    return (
      <div className="p-4 border rounded-lg">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <h3 className="text-red-800 font-semibold">Connection Error</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
        <button 
          onClick={() => refresh()}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  // Use real-time data, fallback to local state for optimistic updates
  const displayEnquiries = enquiries.length > 0 ? enquiries : localEnquiries

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Real-time Enquiries ({displayEnquiries.length})
        </h3>
        <div className="flex items-center space-x-2">
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Last update: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Live connection"></div>
        </div>
      </div>

      {displayEnquiries.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No enquiries found</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {displayEnquiries.map((enquiry) => (
            <div 
              key={enquiry.id}
              className="p-3 border rounded hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-medium">{enquiry.practice_area}</div>
                  {enquiry.client_name && (
                    <div className="text-sm text-gray-600">Client: {enquiry.client_name}</div>
                  )}
                  {enquiry.estimated_value && (
                    <div className="text-sm text-gray-600">
                      Value: £{enquiry.estimated_value.toLocaleString()}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    {new Date(enquiry.created_at).toLocaleDateString()}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <select
                    value={enquiry.status}
                    onChange={(e) => updateEnquiryStatus(enquiry.id, e.target.value)}
                    disabled={mutating}
                    className="text-sm border rounded px-2 py-1 disabled:opacity-50"
                  >
                    <option value="New">New</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Converted">Converted</option>
                    <option value="Lost">Lost</option>
                  </select>
                  
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    enquiry.status === 'New' ? 'bg-blue-100 text-blue-800' :
                    enquiry.status === 'Assigned' ? 'bg-yellow-100 text-yellow-800' :
                    enquiry.status === 'In Progress' ? 'bg-orange-100 text-orange-800' :
                    enquiry.status === 'Converted' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {enquiry.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mutationError && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          Update failed: {mutationError.message}
        </div>
      )}
    </div>
  )
}