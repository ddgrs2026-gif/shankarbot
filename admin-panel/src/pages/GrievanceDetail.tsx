import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Grievance, GrievanceAction, GrievanceStatus } from '../types'
import { getStatusColor, formatDate } from '../lib/utils'
import jsPDF from 'jspdf'
import { Download } from 'lucide-react'

export default function GrievanceDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [remarks, setRemarks] = useState('')
  const [newStatus, setNewStatus] = useState<GrievanceStatus>('Acknowledged')
  const [downloading, setDownloading] = useState(false)

  const { data: grievance, isLoading } = useQuery({
    queryKey: ['grievance', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grievances')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data as Grievance
    },
  })

  const { data: actions = [] } = useQuery({
    queryKey: ['actions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grievance_actions')
        .select('*')
        .eq('grievance_id', id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as GrievanceAction[]
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ currentRemarks, currentStatus }: { currentRemarks: string, currentStatus: GrievanceStatus }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single()

      const adminName = profile?.full_name || 'Admin'

      await supabase.from('grievances').update({
        status: currentStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      await supabase.from('grievance_actions').insert({
        grievance_id: id,
        action_by: profile ? user?.id : null,
        admin_name: adminName,
        remarks: currentRemarks,
        new_status: currentStatus,
      })

      // Notify user via WhatsApp if remarks provided
      if (currentRemarks.trim() && grievance) {
        try {
          console.log('[notify] sending to bot:', grievance.grievance_id, currentRemarks)
          const BOT_URL = import.meta.env.VITE_BOT_URL || 'http://localhost:3001'
          const notifyRes = await fetch(`${BOT_URL}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grievanceId: grievance.grievance_id,
              remarks: currentRemarks,
              newStatus: currentStatus,
              adminName,
            }),
          })
          console.log('[notify] response:', notifyRes.status)
        } catch (err) {
          console.error('[notify] fetch error:', err)
        }
      } else {
        console.log('[notify] skipped — remarks empty or grievance null', { currentRemarks, grievance: !!grievance })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grievance', id] })
      queryClient.invalidateQueries({ queryKey: ['actions', id] })
      setRemarks('')
    },
  })

  if (isLoading) return <div className="p-8 text-gray-900 dark:text-white">Loading...</div>
  if (!grievance) return <div className="p-8 text-gray-900 dark:text-white">Grievance not found</div>

  const downloadReport = async () => {
    setDownloading(true)
    try {
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 15
    const col = margin
    let y = 20

    const addLine = (label: string, value: string, indent = 0) => {
      const x = col + indent
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(label, x, y)
      doc.setFont('helvetica', 'normal')
      const valueX = x + doc.getTextWidth(label) + 2
      const maxW = pageW - valueX - margin
      const lines = doc.splitTextToSize(value, maxW)
      doc.text(lines, valueX, y)
      y += 6 * lines.length
      if (y > 270) { doc.addPage(); y = 20 }
    }

    const addSection = (title: string) => {
      if (y > 260) { doc.addPage(); y = 20 }
      y += 4
      doc.setFillColor(30, 64, 175)
      doc.rect(margin, y - 5, pageW - margin * 2, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(255, 255, 255)
      doc.text(title, col + 2, y)
      doc.setTextColor(0, 0, 0)
      y += 8
    }

    const addDivider = () => {
      doc.setDrawColor(200, 200, 200)
      doc.line(margin, y, pageW - margin, y)
      y += 4
    }

    // Header
    doc.setFillColor(30, 64, 175)
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(255, 255, 255)
    doc.text('DDGRS - Grievance Report', pageW / 2, 12, { align: 'center' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW / 2, 22, { align: 'center' })
    doc.setTextColor(0, 0, 0)
    y = 38

    // Grievance ID & Status
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`Grievance ID: ${grievance.grievance_id}`, col, y)
    y += 7
    doc.setFontSize(10)
    doc.text(`Current Status: ${grievance.status}`, col, y)
    y += 10
    addDivider()

    // Identity
    addSection('IDENTITY')
    if (grievance.is_anonymous) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      doc.text('Anonymous Submission', col, y)
      doc.setFont('helvetica', 'normal')
      y += 7
    } else {
      addLine('Name: ', grievance.user_name || 'N/A')
      addLine('Role: ', grievance.user_role || 'N/A')
      addLine('Department: ', grievance.user_department || 'N/A')
      addLine('Contact: ', grievance.user_id || 'N/A')
    }

    // Grievance Details
    addSection('GRIEVANCE DETAILS')
    addLine('Category: ', grievance.category)
    addLine('Submitted: ', formatDate(grievance.created_at))
    addLine('Last Updated: ', formatDate(grievance.updated_at))
    y += 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Description:', col, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    const descLines = doc.splitTextToSize(grievance.description || '', pageW - margin * 2)
    doc.text(descLines, col, y)
    y += 6 * descLines.length + 4

    // Evidence Image
    if (grievance.image_url) {
      addSection('EVIDENCE IMAGE')
      try {
        // Fetch image and convert to base64
        const response = await fetch(grievance.image_url)
        const blob = await response.blob()
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
        // Calculate image dimensions to fit page
        const imgProps = doc.getImageProperties(base64)
        const maxW = pageW - margin * 2
        const maxH = 80
        const ratio = Math.min(maxW / imgProps.width, maxH / imgProps.height)
        const imgW = imgProps.width * ratio
        const imgH = imgProps.height * ratio
        if (y + imgH > 270) { doc.addPage(); y = 20 }
        // Draw border around image
        doc.setDrawColor(200, 200, 200)
        doc.rect(col - 1, y - 1, imgW + 2, imgH + 2)
        doc.addImage(base64, 'JPEG', col, y, imgW, imgH)
        y += imgH + 8
      } catch {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(10)
        doc.text(`Image URL: ${grievance.image_url}`, col, y)
        y += 7
      }
    }
    addSection(`ACTION HISTORY (${actions.length} actions)`)
    if (actions.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      doc.text('No actions taken yet.', col, y)
      y += 7
    } else {
      // Reverse to show oldest first
      const sorted = [...actions].reverse()
      sorted.forEach((action, i) => {
        if (y > 260) { doc.addPage(); y = 20 }
        doc.setFillColor(245, 247, 250)
        doc.rect(margin, y - 4, pageW - margin * 2, 6, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(30, 64, 175)
        doc.text(`${i + 1}. ${action.new_status}`, col + 2, y)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.text(`${action.admin_name}  |  ${formatDate(action.created_at)}`, pageW - margin, y, { align: 'right' })
        y += 7
        if (action.remarks) {
          const remarkLines = doc.splitTextToSize(`Remarks: ${action.remarks}`, pageW - margin * 2 - 4)
          doc.text(remarkLines, col + 4, y)
          y += 5 * remarkLines.length
        }
        y += 3
        addDivider()
      })
    }

    // Footer
    const totalPages = (doc as any).internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`Page ${p} of ${totalPages}  |  DDGRS Grievance Management System`, pageW / 2, 290, { align: 'center' })
    }

    doc.save(`Grievance_${grievance.grievance_id}_Report.pdf`)
    } catch (err) {
      console.error('Report generation error:', err)
    } finally {
      setDownloading(false)
    }
  }

  const statuses: GrievanceStatus[] = [
    'Submitted', 'Acknowledged', 'Under Review', 'In Progress',
    'Awaiting Confirmation', 'Resolved', 'Closed', 'Rejected'
  ]

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{grievance.grievance_id}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(grievance.status)}`}>
              {grievance.status}
            </span>
            <button
              onClick={downloadReport}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Generating...' : 'Download Report'}
            </button>
          </div>
        </div>

        {/* Identity */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Identity</h2>
          {grievance.is_anonymous ? (
            <p className="text-gray-600 dark:text-gray-400 italic">Anonymous Submission</p>
          ) : (
            <div className="space-y-2 text-gray-900 dark:text-gray-200">
              <p><span className="font-medium">Name:</span> {grievance.user_name || 'N/A'}</p>
              <p><span className="font-medium">Role:</span> {grievance.user_role || 'N/A'}</p>
              <p><span className="font-medium">Department:</span> {grievance.user_department || 'N/A'}</p>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Details</h2>
          <div className="space-y-4">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Category:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-200">{grievance.category}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Submitted:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-200">{formatDate(grievance.created_at)}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Description:</span>
              <p className="mt-2 text-gray-900 dark:text-gray-200">{grievance.description}</p>
            </div>
          </div>
        </div>

        {/* Media */}
        {(grievance.image_url || grievance.video_url) && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Media</h2>
            <div className="space-y-2">
              {grievance.image_url && (
                <a href={grievance.image_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline block">📷 View Image</a>
              )}
              {grievance.video_url && (
                <a href={grievance.video_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline block">🎥 View Video</a>
              )}
            </div>
          </div>
        )}

        {/* Action Panel */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Take Action</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as GrievanceStatus)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add your remarks here..."
              />
            </div>
            <button
              onClick={() => updateMutation.mutate({ currentRemarks: remarks, currentStatus: newStatus })}
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Action'}
            </button>
          </div>
        </div>

        {/* Action History */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Action History</h2>
          <div className="space-y-4">
            {actions.map((action) => (
              <div key={action.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{action.new_status}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{action.remarks}</p>
                  </div>
                  <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                    <p>{action.admin_name}</p>
                    <p>{formatDate(action.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
