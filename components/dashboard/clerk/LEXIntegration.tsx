'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Progress } from '../../ui/progress'
import { 
  Upload,
  Download,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  Calendar,
  Database,
  Activity
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table'

interface ImportRecord {
  id: string
  filename: string
  type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_rows: number
  processed_rows: number
  error_rows: number
  started_at: string
  completed_at?: string
  errors?: any[]
}

interface ExportRecord {
  id: string
  filename: string
  type: string
  created_at: string
  download_url: string
  record_count: number
}

const mockImports: ImportRecord[] = [
  {
    id: '1',
    filename: 'lex_enquiries_2025_01_09.csv',
    type: 'enquiries',
    status: 'completed',
    total_rows: 247,
    processed_rows: 243,
    error_rows: 4,
    started_at: '2025-01-09T06:00:00Z',
    completed_at: '2025-01-09T06:02:15Z',
    errors: []
  },
  {
    id: '2',
    filename: 'lex_clients_2025_01_08.csv',
    type: 'clients',
    status: 'processing',
    total_rows: 89,
    processed_rows: 67,
    error_rows: 2,
    started_at: '2025-01-09T07:30:00Z'
  },
  {
    id: '3',
    filename: 'lex_fees_2025_01_07.csv',
    type: 'fees',
    status: 'failed',
    total_rows: 156,
    processed_rows: 12,
    error_rows: 144,
    started_at: '2025-01-08T18:00:00Z',
    completed_at: '2025-01-08T18:01:30Z',
    errors: ['Invalid currency format', 'Missing required fields']
  }
]

const mockExports: ExportRecord[] = [
  {
    id: '1',
    filename: 'bdip_export_2025_01_09.csv',
    type: 'lex-export',
    created_at: '2025-01-09T19:00:00Z',
    download_url: '/api/csv/download/1',
    record_count: 78
  },
  {
    id: '2',
    filename: 'enquiries_report_2025_01_08.csv',
    type: 'enquiries',
    created_at: '2025-01-08T19:00:00Z',
    download_url: '/api/csv/download/2',
    record_count: 156
  }
]

export function LEXIntegration() {
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [exports, setExports] = useState<ExportRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setImports(mockImports)
      setExports(mockExports)
      setLoading(false)
    }, 600)
  }, [])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    
    // Simulate upload
    setTimeout(() => {
      const newImport: ImportRecord = {
        id: Date.now().toString(),
        filename: file.name,
        type: 'enquiries',
        status: 'processing',
        total_rows: 0,
        processed_rows: 0,
        error_rows: 0,
        started_at: new Date().toISOString()
      }
      
      setImports(prev => [newImport, ...prev])
      setUploading(false)
    }, 2000)
  }

  const handleExportGeneration = async (type: string) => {
    // Simulate export generation
    const newExport: ExportRecord = {
      id: Date.now().toString(),
      filename: `${type}_export_${new Date().toISOString().split('T')[0]}.csv`,
      type,
      created_at: new Date().toISOString(),
      download_url: `/api/csv/download/${Date.now()}`,
      record_count: Math.floor(Math.random() * 200) + 50
    }
    
    setExports(prev => [newExport, ...prev])
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'processing': return <Clock className="h-4 w-4 text-blue-600" />
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-600" />
      case 'pending': return <Clock className="h-4 w-4 text-gray-600" />
      default: return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'processing': return 'bg-blue-100 text-blue-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'pending': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDateTime = (dateString: string) => {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString))
  }

  const calculateProgress = (processed: number, total: number) => {
    if (total === 0) return 0
    return Math.round((processed / total) * 100)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-md" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Upload className="h-4 w-4 mr-2 text-blue-600" />
              Import from LEX
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button 
                  variant="outline" 
                  className="w-full cursor-pointer"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Select CSV File
                    </>
                  )}
                </Button>
              </label>
              <p className="text-xs text-muted-foreground">
                Upload LEX export files (enquiries, clients, fees)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Download className="h-4 w-4 mr-2 text-green-600" />
              Export to LEX
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => handleExportGeneration('lex-export')}
              >
                Generate LEX Export
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => handleExportGeneration('enquiries')}
              >
                Export Enquiries
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Activity className="h-4 w-4 mr-2 text-purple-600" />
              Integration Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Last Import</span>
                <Badge variant="outline">2 hours ago</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Next Export</span>
                <Badge variant="outline">7:00 PM</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">System Status</span>
                <Badge className="bg-green-100 text-green-800">Healthy</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Database className="h-5 w-5 mr-2" />
              Recent Imports
            </div>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            CSV import history and status monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((importRecord) => (
                <TableRow key={importRecord.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                      {importRecord.filename}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{importRecord.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(importRecord.status)}>
                      <div className="flex items-center">
                        {getStatusIcon(importRecord.status)}
                        <span className="ml-1">{importRecord.status}</span>
                      </div>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{importRecord.processed_rows} / {importRecord.total_rows}</span>
                        <span>{calculateProgress(importRecord.processed_rows, importRecord.total_rows)}%</span>
                      </div>
                      {importRecord.total_rows > 0 && (
                        <Progress 
                          value={calculateProgress(importRecord.processed_rows, importRecord.total_rows)}
                          className="h-1"
                        />
                      )}
                      {importRecord.error_rows > 0 && (
                        <div className="text-xs text-red-600">
                          {importRecord.error_rows} errors
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(importRecord.started_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {importRecord.status === 'failed' && (
                        <Button variant="outline" size="sm">
                          Retry
                        </Button>
                      )}
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Download className="h-5 w-5 mr-2" />
            Recent Exports
          </CardTitle>
          <CardDescription>
            Generated export files for LEX integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exports.map((exportRecord) => (
                <TableRow key={exportRecord.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                      {exportRecord.filename}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{exportRecord.type}</Badge>
                  </TableCell>
                  <TableCell>{exportRecord.record_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(exportRecord.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Scheduled Jobs Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Scheduled Operations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Daily LEX Import</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Schedule: Every day at 6:00 AM</div>
                <div>Last run: Today 6:00 AM (Success)</div>
                <div>Next run: Tomorrow 6:00 AM</div>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Daily LEX Export</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Schedule: Every day at 7:00 PM</div>
                <div>Last run: Yesterday 7:00 PM (Success)</div>
                <div>Next run: Today 7:00 PM</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}