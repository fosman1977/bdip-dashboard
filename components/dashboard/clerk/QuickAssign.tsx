'use client'

import { useState, useEffect } from 'react'
import { Button } from '../../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Avatar, AvatarFallback } from '../../ui/avatar'
import { Progress } from '../../ui/progress'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import { 
  Brain,
  User,
  Star,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap
} from 'lucide-react'

interface Enquiry {
  id: string
  lex_reference: string
  client_name: string
  matter_type: string
  practice_area: string
  estimated_value: number
  urgency: string
  complexity: 'Simple' | 'Medium' | 'Complex'
}

interface BarristerRecommendation {
  id: string
  name: string
  seniority: string
  practice_areas: string[]
  engagement_score: number
  current_workload: number
  max_workload: number
  match_score: number
  availability: string
  reasoning: string[]
  estimated_response_time: number
}

const mockEnquiry: Enquiry = {
  id: '1',
  lex_reference: 'LEX2025-001',
  client_name: 'Smith & Partners Ltd',
  matter_type: 'Commercial Dispute',
  practice_area: 'Commercial',
  estimated_value: 75000,
  urgency: 'This Week',
  complexity: 'Medium'
}

const mockRecommendations: BarristerRecommendation[] = [
  {
    id: '1',
    name: 'Sarah Johnson QC',
    seniority: 'KC',
    practice_areas: ['Commercial', 'Chancery', 'Property'],
    engagement_score: 92,
    current_workload: 15,
    max_workload: 20,
    match_score: 95,
    availability: 'Available',
    reasoning: [
      'Perfect practice area match',
      'High engagement score (92/100)',
      'Optimal capacity (75% utilized)',
      'Excellent track record with similar matters'
    ],
    estimated_response_time: 1.2
  },
  {
    id: '2',
    name: 'Michael Thompson',
    seniority: 'Senior',
    practice_areas: ['Commercial', 'Employment'],
    engagement_score: 88,
    current_workload: 18,
    max_workload: 22,
    match_score: 87,
    availability: 'Limited',
    reasoning: [
      'Strong practice area expertise',
      'High engagement score (88/100)',
      'Near capacity (82% utilized)',
      'Recent success with commercial disputes'
    ],
    estimated_response_time: 2.1
  },
  {
    id: '3',
    name: 'Emma Williams',
    seniority: 'Middle',
    practice_areas: ['Commercial', 'Contract'],
    engagement_score: 85,
    current_workload: 12,
    max_workload: 18,
    match_score: 82,
    availability: 'Available',
    reasoning: [
      'Good practice area match',
      'Solid engagement score (85/100)',
      'Good availability (67% utilized)',
      'Rising talent with strong results'
    ],
    estimated_response_time: 1.8
  }
]

export function QuickAssign() {
  const [selectedEnquiry, setSelectedEnquiry] = useState<string>('')
  const [recommendations, setRecommendations] = useState<BarristerRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)

  const loadRecommendations = async (enquiryId: string) => {
    setLoading(true)
    // Simulate API call
    setTimeout(() => {
      setRecommendations(mockRecommendations)
      setLoading(false)
    }, 800)
  }

  useEffect(() => {
    if (selectedEnquiry) {
      loadRecommendations(selectedEnquiry)
    }
  }, [selectedEnquiry])

  const handleAssign = async (barristerId: string) => {
    setAssigning(barristerId)
    // Simulate assignment
    setTimeout(() => {
      setAssigning(null)
      // Show success message or redirect
    }, 1500)
  }

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case 'Available': return 'bg-green-100 text-green-800'
      case 'Limited': return 'bg-amber-100 text-amber-800'
      case 'Busy': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getSeniorityBadge = (seniority: string) => {
    switch (seniority) {
      case 'KC': return 'bg-purple-100 text-purple-800'
      case 'Senior': return 'bg-blue-100 text-blue-800'
      case 'Middle': return 'bg-green-100 text-green-800'
      case 'Junior': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Enquiry Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brain className="h-5 w-5 mr-2 text-blue-600" />
            AI-Powered Assignment
          </CardTitle>
          <CardDescription>
            Select an enquiry to get intelligent barrister recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedEnquiry} onValueChange={setSelectedEnquiry}>
            <SelectTrigger>
              <SelectValue placeholder="Select an enquiry to assign..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">LEX2025-001 - Smith & Partners Ltd (Commercial Dispute)</SelectItem>
              <SelectItem value="2">LEX2025-002 - Jones Construction (Employment Tribunal)</SelectItem>
              <SelectItem value="3">LEX2025-003 - Thames Property Group (Planning Appeal)</SelectItem>
            </SelectContent>
          </Select>

          {selectedEnquiry && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Reference:</span>
                  <p className="text-muted-foreground">{mockEnquiry.lex_reference}</p>
                </div>
                <div>
                  <span className="font-medium">Client:</span>
                  <p className="text-muted-foreground">{mockEnquiry.client_name}</p>
                </div>
                <div>
                  <span className="font-medium">Value:</span>
                  <p className="text-muted-foreground">£{mockEnquiry.estimated_value.toLocaleString()}</p>
                </div>
                <div>
                  <span className="font-medium">Complexity:</span>
                  <Badge variant="outline">{mockEnquiry.complexity}</Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {selectedEnquiry && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recommended Barristers</h3>
            <Button variant="outline" size="sm" onClick={() => loadRecommendations(selectedEnquiry)}>
              <Zap className="h-4 w-4 mr-2" />
              Refresh Recommendations
            </Button>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="h-24 bg-muted animate-pulse rounded-md" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((barrister, index) => (
                <Card key={barrister.id} className={index === 0 ? 'border-blue-200 bg-blue-50' : ''}>
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
                                {index === 0 && <Star className="h-4 w-4 ml-2 text-yellow-500" />}
                              </h4>
                              <div className="flex items-center space-x-2 mt-1">
                                <Badge className={getSeniorityBadge(barrister.seniority)}>
                                  {barrister.seniority}
                                </Badge>
                                <Badge className={getAvailabilityColor(barrister.availability)}>
                                  {barrister.availability}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-blue-600">
                                {barrister.match_score}%
                              </div>
                              <div className="text-sm text-muted-foreground">Match Score</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span>Engagement Score</span>
                                <span className="font-medium">{barrister.engagement_score}/100</span>
                              </div>
                              <Progress value={barrister.engagement_score} className="h-2" />
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span>Current Workload</span>
                                <span className="font-medium">
                                  {Math.round((barrister.current_workload / barrister.max_workload) * 100)}%
                                </span>
                              </div>
                              <Progress 
                                value={(barrister.current_workload / barrister.max_workload) * 100} 
                                className="h-2"
                              />
                            </div>

                            <div className="flex items-center space-x-2 text-sm">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>Est. response: {barrister.estimated_response_time}h</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-medium">Practice Areas:</div>
                            <div className="flex flex-wrap gap-1">
                              {barrister.practice_areas.map((area) => (
                                <Badge key={area} variant="secondary" className="text-xs">
                                  {area}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-medium">Why this match:</div>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {barrister.reasoning.map((reason, i) => (
                                <li key={i} className="flex items-start">
                                  <CheckCircle className="h-3 w-3 mt-0.5 mr-2 text-green-600 flex-shrink-0" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="ml-4 space-y-2">
                        <Button
                          onClick={() => handleAssign(barrister.id)}
                          disabled={assigning === barrister.id}
                          size="sm"
                          className={index === 0 ? 'bg-blue-600 hover:bg-blue-700' : ''}
                        >
                          {assigning === barrister.id ? (
                            <>
                              <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                              Assigning...
                            </>
                          ) : (
                            <>
                              <User className="h-4 w-4 mr-2" />
                              Assign
                            </>
                          )}
                        </Button>
                        
                        <Button variant="outline" size="sm" className="w-full">
                          View Profile
                        </Button>
                      </div>
                    </div>
                    
                    {index === 0 && (
                      <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-200">
                        <div className="flex items-center text-blue-800">
                          <TrendingUp className="h-4 w-4 mr-2" />
                          <span className="text-sm font-medium">Recommended Choice</span>
                        </div>
                        <p className="text-sm text-blue-700 mt-1">
                          This barrister offers the best combination of expertise, availability, and performance for this enquiry.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!selectedEnquiry && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Ready for AI Assignment</h3>
            <p>Select an enquiry above to get intelligent barrister recommendations based on expertise, availability, and performance data.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}