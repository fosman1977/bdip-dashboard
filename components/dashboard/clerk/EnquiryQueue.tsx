'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Badge } from '../../ui/badge'
import { Card, CardContent } from '../../ui/card'
import { Checkbox } from '../../ui/checkbox'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table'
import { 
  Search,
  Filter,
  ArrowUpDown,
  MoreHorizontal,
  UserPlus,
  Download,
  AlertCircle,
  Clock,
  Pound
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu'

interface Enquiry {
  id: string
  lex_reference: string
  client_name: string
  matter_type: string
  practice_area: string
  estimated_value: number
  urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
  source: string
  received_at: string
  status: string
  conversion_probability?: number
}

export function EnquiryQueue() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [selectedEnquiries, setSelectedEnquiries] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [practiceAreaFilter, setPracticeAreaFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [loading, setLoading] = useState(true)

  // Mock data - replace with actual API call
  useEffect(() => {
    const mockEnquiries: Enquiry[] = [
      {
        id: '1',
        lex_reference: 'LEX2025-001',
        client_name: 'Smith & Partners Ltd',
        matter_type: 'Commercial Dispute',
        practice_area: 'Commercial',
        estimated_value: 75000,
        urgency: 'This Week',
        source: 'Referral',
        received_at: '2025-01-09T09:30:00Z',
        status: 'New',
        conversion_probability: 0.72
      },
      {
        id: '2',
        lex_reference: 'LEX2025-002',
        client_name: 'Jones Construction',
        matter_type: 'Employment Tribunal',
        practice_area: 'Employment',
        estimated_value: 25000,
        urgency: 'Immediate',
        source: 'Website',
        received_at: '2025-01-09T08:15:00Z',
        status: 'New',
        conversion_probability: 0.58
      },
      {
        id: '3',
        lex_reference: 'LEX2025-003',
        client_name: 'Thames Property Group',
        matter_type: 'Planning Appeal',
        practice_area: 'Planning',
        estimated_value: 150000,
        urgency: 'This Month',
        source: 'Direct',
        received_at: '2025-01-09T07:45:00Z',
        status: 'New',
        conversion_probability: 0.84
      }
    ]

    setTimeout(() => {
      setEnquiries(mockEnquiries)
      setLoading(false)
    }, 1000)
  }, [])

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'Immediate': return 'bg-red-100 text-red-800'
      case 'This Week': return 'bg-amber-100 text-amber-800'
      case 'This Month': return 'bg-blue-100 text-blue-800'
      case 'Flexible': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
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
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString))
  }

  const handleSelectAll = () => {
    if (selectedEnquiries.length === enquiries.length) {
      setSelectedEnquiries([])
    } else {
      setSelectedEnquiries(enquiries.map(e => e.id))
    }
  }

  const handleSelectEnquiry = (enquiryId: string) => {
    setSelectedEnquiries(prev => 
      prev.includes(enquiryId)
        ? prev.filter(id => id !== enquiryId)
        : [...prev, enquiryId]
    )
  }

  const filteredEnquiries = enquiries.filter(enquiry => {
    const matchesSearch = enquiry.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         enquiry.matter_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         enquiry.lex_reference.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesPracticeArea = !practiceAreaFilter || enquiry.practice_area === practiceAreaFilter
    const matchesUrgency = !urgencyFilter || enquiry.urgency === urgencyFilter
    
    return matchesSearch && matchesPracticeArea && matchesUrgency
  })

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search enquiries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Select value={practiceAreaFilter} onValueChange={setPracticeAreaFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Practice Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Areas</SelectItem>
              <SelectItem value="Commercial">Commercial</SelectItem>
              <SelectItem value="Employment">Employment</SelectItem>
              <SelectItem value="Planning">Planning</SelectItem>
              <SelectItem value="Chancery">Chancery</SelectItem>
              <SelectItem value="Criminal">Criminal</SelectItem>
            </SelectContent>
          </Select>

          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="Immediate">Immediate</SelectItem>
              <SelectItem value="This Week">This Week</SelectItem>
              <SelectItem value="This Month">This Month</SelectItem>
              <SelectItem value="Flexible">Flexible</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedEnquiries.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedEnquiries.length} enquiries selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Bulk Assign
                </Button>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enquiries Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedEnquiries.length === enquiries.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Matter Type</TableHead>
              <TableHead>Practice Area</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Probability</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEnquiries.map((enquiry) => (
              <TableRow key={enquiry.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedEnquiries.includes(enquiry.id)}
                    onCheckedChange={() => handleSelectEnquiry(enquiry.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {enquiry.lex_reference}
                </TableCell>
                <TableCell>{enquiry.client_name}</TableCell>
                <TableCell>{enquiry.matter_type}</TableCell>
                <TableCell>
                  <Badge variant="outline">{enquiry.practice_area}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <Pound className="h-3 w-3 mr-1" />
                    {formatCurrency(enquiry.estimated_value)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={urgencyColor(enquiry.urgency)}>
                    {enquiry.urgency === 'Immediate' && <AlertCircle className="h-3 w-3 mr-1" />}
                    {enquiry.urgency === 'This Week' && <Clock className="h-3 w-3 mr-1" />}
                    {enquiry.urgency}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(enquiry.received_at)}
                </TableCell>
                <TableCell>
                  {enquiry.conversion_probability && (
                    <div className="flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${enquiry.conversion_probability * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm">
                        {Math.round(enquiry.conversion_probability * 100)}%
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Assign Barrister</DropdownMenuItem>
                      <DropdownMenuItem>Update Status</DropdownMenuItem>
                      <DropdownMenuItem>Add Notes</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {filteredEnquiries.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No enquiries found</h3>
              <p>Try adjusting your search criteria or filters.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}