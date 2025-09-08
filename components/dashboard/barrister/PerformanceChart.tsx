'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import {
  Activity,
  TrendingUp,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react'

interface PerformanceData {
  period: string
  engagement_score: number
  response_time: number
  conversion_rate: number
  revenue: number
  instructions: number
}

interface CategoryData {
  category: string
  value: number
  color: string
}

const mockPerformanceData: PerformanceData[] = [
  { period: 'Jan', engagement_score: 82, response_time: 2.8, conversion_rate: 62, revenue: 78000, instructions: 24 },
  { period: 'Feb', engagement_score: 85, response_time: 2.5, conversion_rate: 65, revenue: 82000, instructions: 28 },
  { period: 'Mar', engagement_score: 83, response_time: 2.7, conversion_rate: 63, revenue: 79000, instructions: 26 },
  { period: 'Apr', engagement_score: 87, response_time: 2.2, conversion_rate: 68, revenue: 85000, instructions: 31 },
  { period: 'May', engagement_score: 89, response_time: 2.1, conversion_rate: 71, revenue: 88000, instructions: 33 },
  { period: 'Jun', engagement_score: 88, response_time: 2.3, conversion_rate: 69, revenue: 86000, instructions: 32 }
]

const mockCategoryData: CategoryData[] = [
  { category: 'Commercial', value: 45, color: '#3b82f6' },
  { category: 'Employment', value: 25, color: '#10b981' },
  { category: 'Property', value: 20, color: '#f59e0b' },
  { category: 'Dispute', value: 10, color: '#ef4444' }
]

export function PerformanceChart() {
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryData[]>([])
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line')
  const [timeRange, setTimeRange] = useState<'6m' | '1y' | 'all'>('6m')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => {
      setPerformanceData(mockPerformanceData)
      setCategoryData(mockCategoryData)
      setLoading(false)
    }, 600)
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey === 'revenue' 
                ? `Revenue: ${formatCurrency(entry.value)}`
                : `${entry.name}: ${entry.value}${entry.dataKey === 'conversion_rate' ? '%' : entry.dataKey === 'response_time' ? 'h' : ''}`
              }
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const renderChart = () => {
    const commonProps = {
      data: performanceData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    }

    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="engagement_score" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        )
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="engagement_score" 
                stroke="#3b82f6" 
                fill="#3b82f6" 
                fillOpacity={0.3} 
              />
            </AreaChart>
          </ResponsiveContainer>
        )
      default:
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="engagement_score" 
                stroke="#3b82f6" 
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-80 bg-muted animate-pulse rounded-md" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64 bg-muted animate-pulse rounded-md" />
          <div className="h-64 bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    )
  }

  const latestData = performanceData[performanceData.length - 1]
  const previousData = performanceData[performanceData.length - 2]
  const trend = latestData && previousData 
    ? latestData.engagement_score > previousData.engagement_score ? 'up' : 'down'
    : 'stable'

  return (
    <div className="space-y-4">
      {/* Main Performance Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2 text-blue-600" />
              Performance Trends
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Badge 
                variant="outline" 
                className={trend === 'up' ? 'text-green-700' : trend === 'down' ? 'text-red-700' : 'text-gray-700'}
              >
                <TrendingUp className={`h-3 w-3 mr-1 ${trend === 'down' ? 'rotate-180' : ''}`} />
                {trend === 'up' ? 'Rising' : trend === 'down' ? 'Declining' : 'Stable'}
              </Badge>
              <div className="flex space-x-1">
                <Button
                  variant={timeRange === '6m' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('6m')}
                >
                  6M
                </Button>
                <Button
                  variant={timeRange === '1y' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('1y')}
                >
                  1Y
                </Button>
                <Button
                  variant={timeRange === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('all')}
                >
                  All
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Chart Type:</span>
              <Button
                variant={chartType === 'line' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setChartType('line')}
              >
                Line
              </Button>
              <Button
                variant={chartType === 'bar' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setChartType('bar')}
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button
                variant={chartType === 'area' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setChartType('area')}
              >
                Area
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Last 6 months • Engagement Score
            </div>
          </div>
          
          {renderChart()}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Practice Area Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <PieChartIcon className="h-4 w-4 mr-2 text-purple-600" />
              Practice Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value}%`, 'Cases']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {categoryData.map((item, index) => (
                <div key={index} className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded mr-2" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {item.category} ({item.value}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-green-600" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Instructions</span>
                <div className="text-right">
                  <div className="font-semibold">{latestData?.instructions || 0}</div>
                  <div className="text-xs text-green-600">+15% vs last month</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Revenue</span>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(latestData?.revenue || 0)}</div>
                  <div className="text-xs text-green-600">+8% vs last month</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Response</span>
                <div className="text-right">
                  <div className="font-semibold">{latestData?.response_time || 0}h</div>
                  <div className="text-xs text-green-600">-12% vs last month</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Conversion</span>
                <div className="text-right">
                  <div className="font-semibold">{latestData?.conversion_rate || 0}%</div>
                  <div className="text-xs text-green-600">+5% vs last month</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}