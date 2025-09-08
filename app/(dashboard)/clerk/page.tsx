import { Suspense } from 'react'
import { Metadata } from 'next'
import { EnquiryQueue } from '../../../components/dashboard/clerk/EnquiryQueue'
import { QuickAssign } from '../../../components/dashboard/clerk/QuickAssign'
import { WorkloadMonitor } from '../../../components/dashboard/clerk/WorkloadMonitor'
import { DailyMetrics } from '../../../components/dashboard/clerk/DailyMetrics'
import { LEXIntegration } from '../../../components/dashboard/clerk/LEXIntegration'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { 
  Users, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  FileText, 
  Settings,
  Download,
  RefreshCw
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Clerk Dashboard - BDIP',
  description: 'Chambers management dashboard for clerks',
}

export default function ClerkDashboard() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clerk Dashboard</h1>
          <p className="text-muted-foreground">
            Manage enquiries, assignments, and chamber operations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync LEX
          </Button>
          <Button size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Assignments</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">23</div>
            <p className="text-xs text-muted-foreground">
              +4 from yesterday
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Barristers</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">48</div>
            <p className="text-xs text-muted-foreground">
              87% capacity utilization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2.3h</div>
            <p className="text-xs text-muted-foreground">
              -15min from last week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">68%</div>
            <p className="text-xs text-muted-foreground">
              +2.1% from last month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Enquiry Queue</TabsTrigger>
          <TabsTrigger value="assign">Quick Assign</TabsTrigger>
          <TabsTrigger value="workload">Workload Monitor</TabsTrigger>
          <TabsTrigger value="metrics">Daily Metrics</TabsTrigger>
          <TabsTrigger value="lex">LEX Integration</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Enquiry Queue</CardTitle>
                  <CardDescription>
                    Unassigned enquiries requiring clerk attention
                  </CardDescription>
                </div>
                <Badge variant="secondary">23 pending</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-md" />}>
                <EnquiryQueue />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assign" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Assignment</CardTitle>
              <CardDescription>
                AI-powered recommendations for optimal barrister assignment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-md" />}>
                <QuickAssign />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workload Monitor</CardTitle>
              <CardDescription>
                Real-time barrister capacity and utilization tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-md" />}>
                <WorkloadMonitor />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>
                  Today's key performance indicators
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                  <DailyMetrics />
                </Suspense>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Conversion Tracking</CardTitle>
                <CardDescription>
                  Enquiry to instruction conversion analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Today</span>
                    <Badge variant="outline">72%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">This Week</span>
                    <Badge variant="outline">68%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">This Month</span>
                    <Badge variant="outline">71%</Badge>
                  </div>
                  <div className="h-32 bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                    Conversion Chart Placeholder
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lex" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LEX Integration</CardTitle>
              <CardDescription>
                CSV import/export status and file management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-md" />}>
                <LEXIntegration />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}