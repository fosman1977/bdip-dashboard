'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Avatar, AvatarFallback } from '../../ui/avatar'
import { 
  Clock,
  Building2,
  Calendar,
  FileText,
  Phone,
  Mail,
  MessageSquare,
  ChevronRight,
  Filter,
  Search
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table'
import { createSecureDisplayText } from '../../../lib/security/input-sanitization'

interface Enquiry {
  id: string
  reference: string
  client_name: string
  client_company?: string
  matter_type: 'Commercial' | 'Employment' | 'Property' | 'Dispute' | 'Corporate'
  urgency: 'High' | 'Medium' | 'Low'
  estimated_value: number
  description: string
  assigned_date: string
  deadline?: string
  status: 'new' | 'reviewing' | 'quoted' | 'accepted' | 'declined'
  last_contact: string
  contact_method: 'phone' | 'email' | 'meeting'
  clerk_notes?: string
  barrister_assigned: boolean
}

const mockEnquiries: Enquiry[] = [
  {
    id: '1',
    reference: 'LEX2025-012',
    client_name: 'Sarah Mitchell',
    client_company: 'Mitchell & Associates',
    matter_type: 'Commercial',
    urgency: 'High',
    estimated_value: 45000,
    description: 'Contract dispute regarding software licensing agreement with major tech company',
    assigned_date: '2025-01-08T09:30:00Z',
    deadline: '2025-01-15T17:00:00Z',
    status: 'reviewing',
    last_contact: '2025-01-08T14:20:00Z',
    contact_method: 'email',
    clerk_notes: 'Client stressed timeline - needs response by Friday',
    barrister_assigned: true
  },
  {
    id: '2',
    reference: 'LEX2025-013',
    client_name: 'David Chen',
    client_company: 'Chen Property Holdings',
    matter_type: 'Property',
    urgency: 'Medium',
    estimated_value: 28000,
    description: 'Planning appeal for residential development in Kent - 12 units',
    assigned_date: '2025-01-08T11:15:00Z',
    deadline: '2025-01-20T12:00:00Z',
    status: 'new',
    last_contact: '2025-01-08T11:15:00Z',
    contact_method: 'phone',
    barrister_assigned: true
  },
  {
    id: '3',
    reference: 'LEX2025-014',
    client_name: 'Emma Thompson',
    client_company: 'Thompson Industries Ltd',
    matter_type: 'Employment',
    urgency: 'High',
    estimated_value: 35000,
    description: 'Senior executive dismissal - potential unfair dismissal tribunal case',
    assigned_date: '2025-01-07T16:45:00Z',
    deadline: '2025-01-12T10:00:00Z',
    status: 'quoted',
    last_contact: '2025-01-08T09:10:00Z',
    contact_method: 'meeting',
    clerk_notes: 'Quote sent - awaiting client decision',
    barrister_assigned: true
  },
  {
    id: '4',
    reference: 'LEX2025-015',
    client_name: 'James Wilson',
    client_company: 'Wilson & Partners LLP',
    matter_type: 'Corporate',
    urgency: 'Low',
    estimated_value: 15000,
    description: 'M&A due diligence support for small manufacturing company acquisition',
    assigned_date: '2025-01-07T13:20:00Z',
    status: 'accepted',
    last_contact: '2025-01-07T15:30:00Z',
    contact_method: 'email',
    barrister_assigned: true
  }
]

export function RecentEnquiries() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [filter, setFilter] = useState<'all' | 'new' | 'reviewing' | 'quoted'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => {
      setEnquiries(mockEnquiries)
      setLoading(false)
    }, 500)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800'
      case 'reviewing': return 'bg-amber-100 text-amber-800'
      case 'quoted': return 'bg-purple-100 text-purple-800'
      case 'accepted': return 'bg-green-100 text-green-800'
      case 'declined': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'High': return 'bg-red-100 text-red-800'
      case 'Medium': return 'bg-amber-100 text-amber-800'
      case 'Low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getMatterTypeColor = (type: string) => {
    switch (type) {
      case 'Commercial': return 'bg-blue-100 text-blue-800'
      case 'Employment': return 'bg-green-100 text-green-800'
      case 'Property': return 'bg-orange-100 text-orange-800'
      case 'Dispute': return 'bg-red-100 text-red-800'
      case 'Corporate': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getContactIcon = (method: string) => {
    switch (method) {
      case 'phone': return <Phone className="h-3 w-3" />
      case 'email': return <Mail className="h-3 w-3" />
      case 'meeting': return <MessageSquare className="h-3 w-3" />
      default: return <MessageSquare className="h-3 w-3" />
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDateTime = (dateString: string) => {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString))
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const filteredEnquiries = filter === 'all' 
    ? enquiries 
    : enquiries.filter(e => e.status === filter)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          <div className="flex space-x-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 w-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2 text-indigo-600" />
              Recent Enquiries
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All ({enquiries.length})
              </Button>
              <Button
                variant={filter === 'new' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('new')}
              >
                New ({enquiries.filter(e => e.status === 'new').length})
              </Button>
              <Button
                variant={filter === 'reviewing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('reviewing')}
              >
                Reviewing ({enquiries.filter(e => e.status === 'reviewing').length})
              </Button>
              <Button
                variant={filter === 'quoted' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('quoted')}
              >
                Quoted ({enquiries.filter(e => e.status === 'quoted').length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredEnquiries.map((enquiry) => (
              <Card key={enquiry.id} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-xs">
                          {getInitials(enquiry.client_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-medium">{createSecureDisplayText(enquiry.client_name, 80)}</h4>
                        {enquiry.client_company && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Building2 className="h-3 w-3 mr-1" />
                            {createSecureDisplayText(enquiry.client_company, 60)}
                          </div>
                        )}
                        <div className="text-sm text-muted-foreground mt-1">
                          {createSecureDisplayText(enquiry.reference, 30)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right space-y-1">
                      <Badge className={getStatusColor(enquiry.status)}>
                        {enquiry.status}
                      </Badge>
                      <div className="text-sm font-medium">
                        {formatCurrency(enquiry.estimated_value)}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {createSecureDisplayText(enquiry.description, 150)}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Badge className={getMatterTypeColor(enquiry.matter_type)}>
                        {enquiry.matter_type}
                      </Badge>
                      <Badge className={getUrgencyColor(enquiry.urgency)}>
                        {enquiry.urgency} Priority
                      </Badge>
                      <div className="flex items-center text-xs text-muted-foreground">
                        {getContactIcon(enquiry.contact_method)}
                        <span className="ml-1">Last: {formatDateTime(enquiry.last_contact)}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {enquiry.deadline && (
                        <div className="flex items-center text-xs text-amber-600">
                          <Clock className="h-3 w-3 mr-1" />
                          Due: {formatDateTime(enquiry.deadline)}
                        </div>
                      )}
                      <Button variant="outline" size="sm">
                        View Details
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>

                  {enquiry.clerk_notes && (
                    <div className="mt-3 p-2 bg-blue-50 rounded text-xs">
                      <strong>Clerk Note:</strong> {createSecureDisplayText(enquiry.clerk_notes, 200)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredEnquiries.length === 0 && (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <h3 className="font-medium text-muted-foreground">No enquiries found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === 'all' 
                  ? 'No enquiries have been assigned yet'
                  : `No ${filter} enquiries at the moment`
                }
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {filteredEnquiries.length} of {enquiries.length} enquiries
            </div>
            <Button variant="outline" size="sm">
              View All Enquiries
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}