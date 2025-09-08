import { Suspense } from 'react'
import { Metadata } from 'next'
import { ConversionFunnel } from '../../../components/dashboard/admin/ConversionFunnel'
import { RevenueChart } from '../../../components/dashboard/admin/RevenueChart'
import { BarristerRankings } from '../../../components/dashboard/admin/BarristerRankings'
import { SourceAnalysis } from '../../../components/dashboard/admin/SourceAnalysis'
import { PracticeAreaBreakdown } from '../../../components/dashboard/admin/PracticeAreaBreakdown'
import { SystemHealth } from '../../../components/dashboard/admin/SystemHealth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { 
  BarChart3,
  DollarSign,
  Users,
  TrendingUp,
  Download,
  Settings,
  AlertCircle,
  CheckCircle,
  Target,
  Activity,
  Database
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Admin Dashboard - BDIP',
  description: 'Management overview and system analytics',
}

export default function AdminDashboard() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Management Dashboard</h1>
          <p className="text-muted-foreground">
            Chamber performance overview and business intelligence
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
          <Button variant="outline" size="sm">
            <Database className="h-4 w-4 mr-2" />
            Data Export
          </Button>
          <Button size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">£847K</div>
            <p className="text-xs text-muted-foreground">
              +12% from last month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Barristers</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">52</div>
            <p className="text-xs text-muted-foreground">
              91% utilization rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">73%</div>
            <p className="text-xs text-muted-foreground">
              Above 70% target
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-lg font-semibold">Healthy</span>
            </div>
            <p className="text-xs text-muted-foreground">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trends</CardTitle>
                <CardDescription>
                  Monthly revenue performance and forecasting
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                  <RevenueChart />
                </Suspense>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion Funnel</CardTitle>
                <CardDescription>
                  Enquiry to instruction conversion analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                  <ConversionFunnel />
                </Suspense>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Practice Area Performance</CardTitle>
              <CardDescription>
                Revenue and case distribution by practice area
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                <PracticeAreaBreakdown />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Barrister Rankings</CardTitle>
                    <CardDescription>
                      Performance leaderboard and engagement metrics
                    </CardDescription>
                  </div>
                  <Badge variant="outline">52 active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-md" />}>
                  <BarristerRankings />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Source Analysis</CardTitle>
                <CardDescription>
                  Lead source effectiveness and conversion rates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                  <SourceAnalysis />
                </Suspense>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Metrics</CardTitle>
                <CardDescription>
                  Important KPIs and performance indicators
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Avg Response Time</span>
                    <Badge variant="outline">1.8h</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Client Satisfaction</span>
                    <Badge variant="outline">4.6/5</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Case Success Rate</span>
                    <Badge variant="outline">78%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Monthly Growth</span>
                    <Badge variant="outline" className="text-green-600">+15%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Enquiry Volume</span>
                    <Badge variant="outline">1,247 this month</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Active Clients</span>
                    <Badge variant="outline">328</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>
                Platform performance and operational status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                <SystemHealth />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}