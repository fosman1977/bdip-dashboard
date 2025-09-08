'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Progress } from '../../ui/progress'
import { 
  TrendingUp,
  TrendingDown,
  Award,
  Target,
  Clock,
  Zap,
  Star,
  ChevronUp,
  ChevronDown,
  Minus
} from 'lucide-react'

interface EngagementMetrics {
  overall_score: number
  response_score: number
  conversion_score: number
  satisfaction_score: number
  revenue_score: number
  trend: 'up' | 'down' | 'stable'
  rank: number
  total_barristers: number
  previous_period: number
  achievements: string[]
}

const mockMetrics: EngagementMetrics = {
  overall_score: 87.5,
  response_score: 92,
  conversion_score: 85,
  satisfaction_score: 88,
  revenue_score: 86,
  trend: 'up',
  rank: 3,
  total_barristers: 15,
  previous_period: 84.2,
  achievements: ['Top Performer', 'Quick Responder', 'Client Favourite']
}

export function EngagementScore() {
  const [metrics, setMetrics] = useState<EngagementMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => {
      setMetrics(mockMetrics)
      setLoading(false)
    }, 400)
  }, [])

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 75) return 'text-blue-600'
    if (score >= 60) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBadgeColor = (score: number) => {
    if (score >= 90) return 'bg-green-100 text-green-800'
    if (score >= 75) return 'bg-blue-100 text-blue-800'
    if (score >= 60) return 'bg-amber-100 text-amber-800'
    return 'bg-red-100 text-red-800'
  }

  const getTrendIcon = (trend: string, change: number) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-600" />
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-600" />
    return <Minus className="h-4 w-4 text-gray-600" />
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ChevronUp className="h-3 w-3 text-green-600" />
    if (change < 0) return <ChevronDown className="h-3 w-3 text-red-600" />
    return <Minus className="h-3 w-3 text-gray-600" />
  }

  const formatChange = (current: number, previous: number) => {
    const change = current - previous
    const sign = change > 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}`
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-md" />
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    )
  }

  if (!metrics) return null

  const change = metrics.overall_score - metrics.previous_period

  return (
    <div className="space-y-4">
      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <Award className="h-5 w-5 mr-2 text-purple-600" />
              Engagement Score
            </CardTitle>
            <div className="flex items-center space-x-2">
              {getTrendIcon(metrics.trend, change)}
              <span className={`text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatChange(metrics.overall_score, metrics.previous_period)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className={`text-3xl font-bold ${getScoreColor(metrics.overall_score)}`}>
                {metrics.overall_score.toFixed(1)}
              </div>
              <p className="text-sm text-muted-foreground">Overall Performance</p>
            </div>
            <div className="text-right">
              <div className="flex items-center">
                <Badge className={getScoreBadgeColor(metrics.overall_score)}>
                  #{metrics.rank} of {metrics.total_barristers}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Chamber Ranking</p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span>Performance Level</span>
              <span className="font-medium">{Math.round(metrics.overall_score)}%</span>
            </div>
            <Progress value={metrics.overall_score} className="h-2" />
          </div>

          {/* Achievements */}
          <div className="flex flex-wrap gap-2">
            {metrics.achievements.map((achievement, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                {achievement}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Score Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2 text-blue-600" />
                <span className="text-sm font-medium">Response Time</span>
              </div>
              <div className="flex items-center">
                {getChangeIcon(2.5)}
                <span className="text-sm font-bold">{metrics.response_score}</span>
              </div>
            </div>
            <Progress value={metrics.response_score} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              Average: 2.3 hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Target className="h-4 w-4 mr-2 text-green-600" />
                <span className="text-sm font-medium">Conversion Rate</span>
              </div>
              <div className="flex items-center">
                {getChangeIcon(1.2)}
                <span className="text-sm font-bold">{metrics.conversion_score}</span>
              </div>
            </div>
            <Progress value={metrics.conversion_score} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              65% enquiry to instruction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Star className="h-4 w-4 mr-2 text-amber-600" />
                <span className="text-sm font-medium">Client Satisfaction</span>
              </div>
              <div className="flex items-center">
                {getChangeIcon(0.8)}
                <span className="text-sm font-bold">{metrics.satisfaction_score}</span>
              </div>
            </div>
            <Progress value={metrics.satisfaction_score} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              4.4 / 5.0 rating
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Zap className="h-4 w-4 mr-2 text-purple-600" />
                <span className="text-sm font-medium">Revenue Impact</span>
              </div>
              <div className="flex items-center">
                {getChangeIcon(3.2)}
                <span className="text-sm font-bold">{metrics.revenue_score}</span>
              </div>
            </div>
            <Progress value={metrics.revenue_score} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              £86k this quarter
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}