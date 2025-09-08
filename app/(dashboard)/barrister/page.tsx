import { Suspense } from 'react'
import { Metadata } from 'next'
import { MyTasks } from '../../../components/dashboard/barrister/MyTasks'
import { EngagementScore } from '../../../components/dashboard/barrister/EngagementScore'
import { PerformanceChart } from '../../../components/dashboard/barrister/PerformanceChart'
import { RecentEnquiries } from '../../../components/dashboard/barrister/RecentEnquiries'
import { ConversionRate } from '../../../components/dashboard/barrister/ConversionRate'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Progress } from '../../../components/ui/progress'
import { 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Star,
  Calendar,
  FileText,
  Target,
  Award
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Barrister Dashboard - BDIP',
  description: 'Personal performance dashboard for barristers',
}

export default function BarristerDashboard() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Dashboard</h1>
          <p className="text-muted-foreground">
            Track your performance, tasks, and engagement metrics
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            View Calendar
          </Button>
          <Button size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Case Notes
          </Button>
        </div>
      </div>

      {/* Performance Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagement Score</CardTitle>
            <Star className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">87.2</div>
            <Progress value={87} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              +3.2 from last month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              3 due today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Time</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1.2h</div>
            <p className="text-xs text-muted-foreground">
              25% better than average
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Award className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">74%</div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">My Tasks</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="enquiries">Recent Enquiries</TabsTrigger>
          <TabsTrigger value="metrics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>My Tasks</CardTitle>
                    <CardDescription>
                      Pending actions and deadlines
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">12 active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                  <MyTasks />
                </Suspense>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Score</CardTitle>
                <CardDescription>
                  Performance breakdown and trends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                  <EngagementScore />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Chart</CardTitle>
              <CardDescription>
                Historical performance trends and metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-md" />}>
                <PerformanceChart />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enquiries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Enquiries</CardTitle>
              <CardDescription>
                Recently assigned matters and status updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-md" />}>
                <RecentEnquiries />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Conversion Rate</CardTitle>
                <CardDescription>
                  Enquiry to instruction success rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
                  <ConversionRate />
                </Suspense>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Monthly Goals</CardTitle>
                <CardDescription>
                  Progress towards personal targets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Response Time Goal</span>
                      <span className="text-sm text-muted-foreground">&lt; 2h</span>
                    </div>
                    <Progress value={85} />
                    <p className="text-xs text-muted-foreground">Currently averaging 1.2h</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Conversion Target</span>
                      <span className="text-sm text-muted-foreground">75%</span>
                    </div>
                    <Progress value={98} />
                    <p className="text-xs text-muted-foreground">Currently at 74%</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Monthly Revenue</span>
                      <span className="text-sm text-muted-foreground">£50k</span>
                    </div>
                    <Progress value={67} />
                    <p className="text-xs text-muted-foreground">£33.5k generated this month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}