'use client'

import { useState, useEffect } from 'react'
import { useSafeAsync, useTimeout } from '../../../lib/hooks/use-safe-async'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Card, CardContent } from '../../ui/card'
import { Checkbox } from '../../ui/checkbox'
import { 
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  FileText,
  Phone,
  Mail,
  Users
} from 'lucide-react'
import { createSecureDisplayText } from '../../../lib/security/input-sanitization'

interface Task {
  id: string
  title: string
  description: string
  type: 'Call' | 'Email' | 'Research' | 'Meeting' | 'Proposal' | 'Follow-up'
  priority: 'High' | 'Medium' | 'Low'
  due_date: string
  enquiry_reference?: string
  client_name?: string
  estimated_duration: number // minutes
  completed: boolean
  points: number
}

const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Client consultation call',
    description: 'Initial consultation with Smith & Partners regarding commercial dispute',
    type: 'Call',
    priority: 'High',
    due_date: '2025-01-09T14:00:00Z',
    enquiry_reference: 'LEX2025-001',
    client_name: 'Smith & Partners Ltd',
    estimated_duration: 60,
    completed: false,
    points: 10
  },
  {
    id: '2',
    title: 'Research property law precedents',
    description: 'Find relevant case law for Thames Property Group planning appeal',
    type: 'Research',
    priority: 'Medium',
    due_date: '2025-01-10T10:00:00Z',
    enquiry_reference: 'LEX2025-003',
    client_name: 'Thames Property Group',
    estimated_duration: 120,
    completed: false,
    points: 8
  },
  {
    id: '3',
    title: 'Draft settlement proposal',
    description: 'Prepare initial settlement terms for ongoing commercial matter',
    type: 'Proposal',
    priority: 'High',
    due_date: '2025-01-09T16:30:00Z',
    enquiry_reference: 'LEX2024-089',
    client_name: 'Johnson Industries',
    estimated_duration: 90,
    completed: false,
    points: 12
  },
  {
    id: '4',
    title: 'Follow up with instructing solicitor',
    description: 'Check on additional documentation for employment tribunal',
    type: 'Follow-up',
    priority: 'Medium',
    due_date: '2025-01-09T11:00:00Z',
    enquiry_reference: 'LEX2025-002',
    client_name: 'Jones Construction',
    estimated_duration: 30,
    completed: true,
    points: 5
  },
  {
    id: '5',
    title: 'Team strategy meeting',
    description: 'Discuss approach for complex multi-party commercial litigation',
    type: 'Meeting',
    priority: 'Medium',
    due_date: '2025-01-10T15:00:00Z',
    estimated_duration: 45,
    completed: false,
    points: 7
  }
]

export function MyTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const { safeAsync, safeSetState } = useSafeAsync()
  const { setTimeoutSafe } = useTimeout()

  useEffect(() => {
    const loadTasks = async () => {
      try {
        await safeAsync(async (signal) => {
          return new Promise<void>((resolve) => {
            const timeoutId = setTimeout(() => {
              if (!signal.aborted) {
                resolve()
              }
            }, 500)
            
            signal.addEventListener('abort', () => {
              clearTimeout(timeoutId)
            })
          })
        })

        safeSetState(() => {
          setTasks(mockTasks)
          setLoading(false)
        })
      } catch (error) {
        console.error('Error loading tasks:', error)
        safeSetState(() => {
          setLoading(false)
        })
      }
    }

    loadTasks()
  }, [safeAsync, safeSetState])

  const handleTaskComplete = (taskId: string) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ))
  }

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'Call': return <Phone className="h-3 w-3" />
      case 'Email': return <Mail className="h-3 w-3" />
      case 'Research': return <FileText className="h-3 w-3" />
      case 'Meeting': return <Users className="h-3 w-3" />
      case 'Proposal': return <FileText className="h-3 w-3" />
      case 'Follow-up': return <CheckCircle className="h-3 w-3" />
      default: return <Clock className="h-3 w-3" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'bg-red-100 text-red-800'
      case 'Medium': return 'bg-amber-100 text-amber-800'
      case 'Low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Call': return 'bg-blue-100 text-blue-800'
      case 'Email': return 'bg-purple-100 text-purple-800'
      case 'Research': return 'bg-indigo-100 text-indigo-800'
      case 'Meeting': return 'bg-green-100 text-green-800'
      case 'Proposal': return 'bg-orange-100 text-orange-800'
      case 'Follow-up': return 'bg-cyan-100 text-cyan-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 0) {
      return `Overdue by ${Math.abs(diffHours)}h`
    } else if (diffHours < 24) {
      return `Due in ${diffHours}h`
    } else {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date)
    }
  }

  const isDue = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60))
    return diffHours <= 2 && diffHours >= 0 // Due within 2 hours
  }

  const isOverdue = (dateString: string) => {
    return new Date(dateString) < new Date()
  }

  const activeTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Active Tasks */}
      <div className="space-y-3">
        {activeTasks.map((task) => (
          <Card 
            key={task.id} 
            className={`${
              isOverdue(task.due_date) && !task.completed
                ? 'border-red-200 bg-red-50' 
                : isDue(task.due_date) && !task.completed
                ? 'border-amber-200 bg-amber-50'
                : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={() => handleTaskComplete(task.id)}
                  className="mt-1"
                />
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {createSecureDisplayText(task.title, 100)}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {createSecureDisplayText(task.description, 200)}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className={`text-xs ${
                        isOverdue(task.due_date) && !task.completed ? 'text-red-600 font-medium' :
                        isDue(task.due_date) && !task.completed ? 'text-amber-600 font-medium' :
                        'text-muted-foreground'
                      }`}>
                        {formatDateTime(task.due_date)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {task.points} pts
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge className={getTypeColor(task.type)}>
                        {getTaskIcon(task.type)}
                        <span className="ml-1">{task.type}</span>
                      </Badge>
                      <Badge className={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                      {task.client_name && (
                        <Badge variant="outline" className="text-xs">
                          {createSecureDisplayText(task.client_name, 50)}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      {task.estimated_duration}min
                    </div>
                  </div>

                  {task.enquiry_reference && (
                    <div className="text-xs text-muted-foreground">
                      Case: {createSecureDisplayText(task.enquiry_reference, 30)}
                    </div>
                  )}

                  {(isOverdue(task.due_date) || isDue(task.due_date)) && !task.completed && (
                    <div className={`flex items-center text-xs ${
                      isOverdue(task.due_date) ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {isOverdue(task.due_date) ? 'Overdue - Immediate attention required' : 'Due soon'}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeTasks.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <h3 className="font-medium text-green-800">All caught up!</h3>
            <p className="text-sm text-green-700 mt-1">
              No pending tasks at the moment
            </p>
          </CardContent>
        </Card>
      )}

      {/* Completed Tasks (if any) */}
      {completedTasks.length > 0 && (
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-muted-foreground">Recently Completed</h4>
            <Badge variant="outline">{completedTasks.length}</Badge>
          </div>
          <div className="space-y-2">
            {completedTasks.slice(0, 3).map((task) => (
              <div key={task.id} className="flex items-center space-x-3 p-2 rounded-md bg-muted/50">
                <Checkbox checked={true} disabled />
                <div className="flex-1">
                  <div className="text-sm line-through text-muted-foreground">
                    {createSecureDisplayText(task.title, 80)}
                  </div>
                  {task.client_name && (
                    <div className="text-xs text-muted-foreground">
                      {createSecureDisplayText(task.client_name, 40)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-green-600">
                  +{task.points} pts
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="pt-4 border-t">
        <Button variant="outline" className="w-full" size="sm">
          <Calendar className="h-4 w-4 mr-2" />
          View All Tasks
        </Button>
      </div>
    </div>
  )
}