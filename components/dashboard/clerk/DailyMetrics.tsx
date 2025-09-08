'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Progress } from '../../ui/progress'
import { 
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  FileText,
  Target,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

interface DailyMetric {
  label: string
  value: string | number
  change: number
  changeLabel: string
  target?: number
  status: 'good' | 'warning' | 'danger'
  icon: any
}

interface ResponseTimeMetric {
  practice_area: string
  avg_response_time: number
  target: number
  trend: 'up' | 'down' | 'stable'
}

const mockMetrics: DailyMetric[] = [
  {
    label: 'New Enquiries',
    value: 12,
    change: 8.3,
    changeLabel: 'vs yesterday',
    target: 15,
    status: 'good',
    icon: FileText
  },
  {
    label: 'Assignments Made',
    value: 18,
    change: -5.2,
    changeLabel: 'vs yesterday',
    target: 20,
    status: 'warning',
    icon: Users
  },
  {
    label: 'Avg Response Time',
    value: '2.3h',
    change: -12.5,
    changeLabel: 'improvement',
    target: 3,
    status: 'good',
    icon: Clock
  },
  {
    label: 'Conversion Rate',
    value: '72%',
    change: 3.8,
    changeLabel: 'vs last week',
    target: 70,
    status: 'good',
    icon: Target
  }
]

const mockResponseTimes: ResponseTimeMetric[] = [
  {
    practice_area: 'Commercial',
    avg_response_time: 1.8,
    target: 2.0,
    trend: 'down'
  },
  {
    practice_area: 'Employment',
    avg_response_time: 2.2,
    target: 2.5,
    trend: 'stable'
  },
  {
    practice_area: 'Criminal',
    avg_response_time: 0.8,
    target: 1.0,
    trend: 'down'
  },
  {
    practice_area: 'Planning',
    avg_response_time: 3.2,
    target: 3.0,
    trend: 'up'
  },
  {
    practice_area: 'Chancery',
    avg_response_time: 2.8,
    target: 3.0,
    trend: 'stable'
  }
]

export function DailyMetrics() {
  const [metrics, setMetrics] = useState<DailyMetric[]>([])
  const [responseTimes, setResponseTimes] = useState<ResponseTimeMetric[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setMetrics(mockMetrics)
      setResponseTimes(mockResponseTimes)
      setLoading(false)
    }, 600)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600'
      case 'warning': return 'text-amber-600'
      case 'danger': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-red-500" />
      case 'down': return <TrendingDown className="h-3 w-3 text-green-500" />
      case 'stable': return <div className="h-3 w-3 rounded-full bg-blue-500" />
      default: return null
    }
  }

  const getResponseTimeStatus = (actual: number, target: number) => {
    if (actual <= target * 0.8) return 'excellent'
    if (actual <= target) return 'good'
    if (actual <= target * 1.2) return 'warning'
    return 'danger'
  }

  const getResponseTimeColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'bg-emerald-100 text-emerald-800'
      case 'good': return 'bg-green-100 text-green-800'
      case 'warning': return 'bg-amber-100 text-amber-800'
      case 'danger': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-md" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Main Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {metrics.map((metric, index) => {
          const Icon = metric.icon
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
                <Icon className={`h-4 w-4 ${getStatusColor(metric.status)}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metric.value}</div>
                <div className="flex items-center space-x-2 mt-2">
                  <div className={`flex items-center text-xs ${metric.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {metric.change >= 0 ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(metric.change)}%
                  </div>
                  <span className="text-xs text-muted-foreground">{metric.changeLabel}</span>
                </div>
                {metric.target && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span>Progress to target</span>
                      <span>{Math.round((Number(metric.value) / metric.target) * 100)}%</span>
                    </div>
                    <Progress 
                      value={Math.min(100, (Number(metric.value) / metric.target) * 100)}
                      className="h-2"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Response Time Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            Response Times by Practice Area
          </CardTitle>
          <CardDescription>
            Average response times compared to targets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {responseTimes.map((item, index) => {
              const status = getResponseTimeStatus(item.avg_response_time, item.target)
              return (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center space-x-3">
                    <div className="font-medium min-w-[100px]">{item.practice_area}</div>
                    <Badge className={getResponseTimeColor(status)}>
                      {item.avg_response_time}h avg
                    </Badge>
                    <div className="flex items-center text-sm text-muted-foreground">
                      Target: {item.target}h
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getTrendIcon(item.trend)}
                    <div className="text-sm">
                      {status === 'excellent' && <CheckCircle className="h-4 w-4 text-emerald-600" />}
                      {status === 'good' && <CheckCircle className="h-4 w-4 text-green-600" />}
                      {status === 'warning' && <AlertCircle className="h-4 w-4 text-amber-600" />}
                      {status === 'danger' && <AlertCircle className="h-4 w-4 text-red-600" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Additional Insights */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's Highlights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">All urgent enquiries assigned within 1 hour</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">3 high-value conversions confirmed</span>
            </div>
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm">2 barristers approaching capacity limit</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <div className="font-medium text-blue-800 mb-1">Workload Balance</div>
              <div className="text-blue-700">
                Consider redistributing 3 cases from Michael Thompson to Emma Williams
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-sm">
              <div className="font-medium text-green-800 mb-1">Performance</div>
              <div className="text-green-700">
                Commercial team is exceeding all response time targets
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}