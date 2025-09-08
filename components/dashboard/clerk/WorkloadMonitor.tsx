'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Progress } from '../../ui/progress'
import { Avatar, AvatarFallback } from '../../ui/avatar'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import { 
  BarChart3,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Timer,
  Target,
  Filter
} from 'lucide-react'

interface BarristerWorkload {
  id: string
  name: string
  seniority: string
  practice_areas: string[]
  current_workload: number
  max_workload: number
  engagement_score: number
  active_cases: number
  pending_tasks: number
  avg_response_time: number
  utilization_trend: 'up' | 'down' | 'stable'
  status: 'optimal' | 'high' | 'overloaded' | 'underutilized'
  last_assignment: string
}

const mockWorkloads: BarristerWorkload[] = [
  {
    id: '1',
    name: 'Sarah Johnson QC',
    seniority: 'KC',
    practice_areas: ['Commercial', 'Chancery'],
    current_workload: 15,
    max_workload: 20,
    engagement_score: 92,
    active_cases: 8,
    pending_tasks: 12,
    avg_response_time: 1.2,
    utilization_trend: 'stable',
    status: 'optimal',
    last_assignment: '2025-01-09T10:30:00Z'
  },
  {
    id: '2',
    name: 'Michael Thompson',
    seniority: 'Senior',
    practice_areas: ['Commercial', 'Employment'],
    current_workload: 22,
    max_workload: 22,
    engagement_score: 88,
    active_cases: 12,
    pending_tasks: 8,
    avg_response_time: 2.1,
    utilization_trend: 'up',
    status: 'high',
    last_assignment: '2025-01-09T09:15:00Z'
  },
  {
    id: '3',
    name: 'Emma Williams',
    seniority: 'Middle',
    practice_areas: ['Commercial', 'Contract'],
    current_workload: 12,
    max_workload: 18,
    engagement_score: 85,
    active_cases: 6,
    pending_tasks: 4,
    avg_response_time: 1.8,
    utilization_trend: 'down',
    status: 'underutilized',
    last_assignment: '2025-01-08T16:45:00Z'
  },
  {
    id: '4',
    name: 'James Roberts',
    seniority: 'Junior',
    practice_areas: ['Criminal', 'Family'],
    current_workload: 25,
    max_workload: 20,
    engagement_score: 78,
    active_cases: 15,
    pending_tasks: 18,
    avg_response_time: 3.2,
    utilization_trend: 'up',
    status: 'overloaded',
    last_assignment: '2025-01-09T11:20:00Z'
  }
]

export function WorkloadMonitor() {
  const [workloads, setWorkloads] = useState<BarristerWorkload[]>([])
  const [practiceAreaFilter, setPracticeAreaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setWorkloads(mockWorkloads)
      setLoading(false)
    }, 800)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'optimal': return 'bg-green-100 text-green-800'
      case 'high': return 'bg-amber-100 text-amber-800'
      case 'overloaded': return 'bg-red-100 text-red-800'
      case 'underutilized': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getSeniorityColor = (seniority: string) => {
    switch (seniority) {
      case 'KC': return 'bg-purple-100 text-purple-800'
      case 'Senior': return 'bg-blue-100 text-blue-800'
      case 'Middle': return 'bg-green-100 text-green-800'
      case 'Junior': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-red-600" />
      case 'down': return <TrendingDown className="h-3 w-3 text-green-600" />
      case 'stable': return <Activity className="h-3 w-3 text-blue-600" />
      default: return null
    }
  }

  const getUtilizationPercentage = (current: number, max: number) => {
    return Math.round((current / max) * 100)
  }

  const filteredWorkloads = workloads.filter(workload => {
    const matchesPracticeArea = !practiceAreaFilter || 
      workload.practice_areas.some(area => area.toLowerCase().includes(practiceAreaFilter.toLowerCase()))
    const matchesStatus = !statusFilter || workload.status === statusFilter
    
    return matchesPracticeArea && matchesStatus
  })

  // Summary statistics
  const totalBarristers = workloads.length
  const overloadedCount = workloads.filter(w => w.status === 'overloaded').length
  const underutilizedCount = workloads.filter(w => w.status === 'underutilized').length
  const averageUtilization = workloads.length > 0 
    ? Math.round(workloads.reduce((sum, w) => sum + getUtilizationPercentage(w.current_workload, w.max_workload), 0) / workloads.length)
    : 0

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Barristers</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBarristers}</div>
            <p className="text-xs text-muted-foreground">Active members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Utilization</CardTitle>
            <BarChart3 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageUtilization}%</div>
            <p className="text-xs text-muted-foreground">Across all barristers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overloaded</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overloadedCount}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Under-utilized</CardTitle>
            <Target className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{underutilizedCount}</div>
            <p className="text-xs text-muted-foreground">Available capacity</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={practiceAreaFilter} onValueChange={setPracticeAreaFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Practice Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Areas</SelectItem>
              <SelectItem value="Commercial">Commercial</SelectItem>
              <SelectItem value="Employment">Employment</SelectItem>
              <SelectItem value="Criminal">Criminal</SelectItem>
              <SelectItem value="Chancery">Chancery</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            <SelectItem value="optimal">Optimal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="overloaded">Overloaded</SelectItem>
            <SelectItem value="underutilized">Under-utilized</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="ml-auto">
          <BarChart3 className="h-4 w-4 mr-2" />
          Optimize Workload
        </Button>
      </div>

      {/* Barrister Workload Cards */}
      <div className="space-y-4">
        {filteredWorkloads.map((barrister) => (
          <Card key={barrister.id} className={barrister.status === 'overloaded' ? 'border-red-200 bg-red-50' : ''}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4 flex-1">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>
                      {barrister.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold flex items-center">
                          {barrister.name}
                          {getTrendIcon(barrister.utilization_trend)}
                        </h4>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge className={getSeniorityColor(barrister.seniority)}>
                            {barrister.seniority}
                          </Badge>
                          <Badge className={getStatusColor(barrister.status)}>
                            {barrister.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {getUtilizationPercentage(barrister.current_workload, barrister.max_workload)}%
                        </div>
                        <div className="text-sm text-muted-foreground">Utilization</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Workload</span>
                        <span>{barrister.current_workload} / {barrister.max_workload}</span>
                      </div>
                      <Progress 
                        value={getUtilizationPercentage(barrister.current_workload, barrister.max_workload)} 
                        className="h-2"
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="font-medium">Active Cases</div>
                        <div className="text-muted-foreground">{barrister.active_cases}</div>
                      </div>
                      <div>
                        <div className="font-medium">Pending Tasks</div>
                        <div className="text-muted-foreground">{barrister.pending_tasks}</div>
                      </div>
                      <div>
                        <div className="font-medium">Engagement Score</div>
                        <div className="text-muted-foreground">{barrister.engagement_score}/100</div>
                      </div>
                      <div>
                        <div className="font-medium">Avg Response</div>
                        <div className="text-muted-foreground">{barrister.avg_response_time}h</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {barrister.practice_areas.map((area) => (
                        <Badge key={area} variant="secondary" className="text-xs">
                          {area}
                        </Badge>
                      ))}
                    </div>

                    {barrister.status === 'overloaded' && (
                      <div className="p-3 bg-red-100 rounded-lg border border-red-200">
                        <div className="flex items-center text-red-800">
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          <span className="text-sm font-medium">Overloaded - Action Required</span>
                        </div>
                        <p className="text-sm text-red-700 mt-1">
                          This barrister is exceeding capacity. Consider redistributing workload or adjusting assignments.
                        </p>
                      </div>
                    )}

                    {barrister.status === 'underutilized' && (
                      <div className="p-3 bg-blue-100 rounded-lg border border-blue-200">
                        <div className="flex items-center text-blue-800">
                          <Target className="h-4 w-4 mr-2" />
                          <span className="text-sm font-medium">Under-utilized - Opportunity Available</span>
                        </div>
                        <p className="text-sm text-blue-700 mt-1">
                          This barrister has available capacity for additional assignments.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="ml-4 space-y-2">
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                  <Button variant="outline" size="sm" className="w-full">
                    <Timer className="h-4 w-4 mr-2" />
                    Adjust Load
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredWorkloads.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No barristers found</h3>
              <p>Try adjusting your filter criteria.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}