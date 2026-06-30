import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Grievance, GrievanceAction } from '../types'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDate } from '../lib/utils'
import jsPDF from 'jspdf'

export default function Reports() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchId, setSearchId] = useState('')
  const [generating, setGenerating] = useState(false)

  const { data: grievances = [], isLoading } = useQuery({
    queryKey: ['grievances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('grievances').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Grievance[]
    },
  })

  const categories = [
    'Academic', 'Examination', 'Infrastructure', 'Hostel',
    'Library', 'Administration', 'IT / Network', 'Discipline / Harassment', 'Other'
  ]

  const categoryData = categories.map(c => ({
    name: c, count: grievances.filter(g => g.category === c).length
  })).filter(i => i.count > 0)

  const statusData = [
    { name: 'Submitted', value: grievances.filter(g => g.status === 'Submitted').length, color: '#3B82F6' },
    { name: 'Acknowledged', value: grievances.filter(g => g.status === 'Acknowledged').length, color: '#60A5FA' },
    { name: 'Under Review', value: grievances.filter(g => g.status === 'Under Review').length, color: '#F59E0B' },
    { name: 'In Progress', value: grievances.filter(g => g.status === 'In Progress').length, color: '#FB923C' },
    { name: 'Awaiting Confirmation', value: grievances.filter(g => g.status === 'Awaiting Confirmation').length, color: '#8B5CF6' },
    { name: 'Resolved', value: grievances.filter(g => g.status === 'Resolved').length, color: '#10B981' },
    { name: 'Closed', value: grievances.filter(g => g.status === 'Closed').length, color: '#6B7280' },
    { name: 'Rejected', value: grievances.filter(g => g.status === 'Rejected').length, color: '#EF4444' },
  ].filter(i => i.value > 0)

  // ── Download report by time period ────────────────────────────────────────
  const downloadPeriodReport = async () => {
    if (!fromDate || !toDate) return alert('Please select both from and to dates.')
    setGenerating(true)
    try {
      const from = new Date(fromDate)
      const to = new Date(toDate)
      to.setHours(23, 59, 59, 999)

      const filtered = grievances.filter(g => {
        const d = new Date(g.created_at)
        return d >= from && d <= to
      })

      const doc = new jsPDF()
      const pageW = doc.internal.pageSize.getWidth()
      const margin = 15
      let y = 20

      // Header
      doc.setFillColor(30, 64, 175)
      doc.rect(0, 0, pageW, 28, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(255, 255, 255)
      doc.text('DDGRS — Period Report', pageW / 2, 12, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`${fromDate} to ${toDate}  |  Generated: ${new Date().toLocaleString()}`, pageW / 2, 22, { align: 'center' })
      doc.setTextColor(0, 0, 0)
      y = 38

      // Summary
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(`Total Grievances: ${filtered.length}`, margin, y); y += 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(`Resolved: ${filtered.filter(g => g.status === 'Resolved' || g.status === 'Closed').length}`, margin, y); y += 6
      doc.text(`Pending: ${filtered.filter(g => g.status === 'Submitted' || g.status === 'Acknowledged').length}`, margin, y); y += 10

      // Table
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setFillColor(30, 64, 175)
      doc.rect(margin, y - 5, pageW - margin * 2, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text('ID', margin + 2, y)
      doc.text('Category', margin + 35, y)
      doc.text('Status', margin + 90, y)
      doc.text('Date', margin + 135, y)
      doc.setTextColor(0, 0, 0)
      y += 8

      doc.setFont('helvetica', 'normal')
      filtered.forEach((g, i) => {
        if (y > 270) { doc.addPage(); y = 20 }
        if (i % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(margin, y - 4, pageW - margin * 2, 7, 'F') }
        doc.text(g.grievance_id, margin + 2, y)
        doc.text(g.category.substring(0, 20), margin + 35, y)
        doc.text(g.status, margin + 90, y)
        doc.text(new Date(g.created_at).toLocaleDateString(), margin + 135, y)
        y += 7
      })

      doc.save(`DDGRS_Report_${fromDate}_to_${toDate}.pdf`)
    } finally {
      setGenerating(false)
    }
  }

  // ── Download report by grievance ID ───────────────────────────────────────
  const downloadGrievanceReport = async () => {
    if (!searchId.trim()) return alert('Please enter a Grievance ID.')
    setGenerating(true)
    try {
      const { data: grievance, error } = await supabase
        .from('grievances').select('*').eq('grievance_id', searchId.toUpperCase().trim()).single()
      if (error || !grievance) { alert('Grievance not found.'); return }

      const { data: actions = [] } = await supabase
        .from('grievance_actions').select('*').eq('grievance_id', grievance.id).order('created_at', { ascending: true })

      const doc = new jsPDF()
      const pageW = doc.internal.pageSize.getWidth()
      const margin = 15
      let y = 38

      doc.setFillColor(30, 64, 175)
      doc.rect(0, 0, pageW, 28, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(255, 255, 255)
      doc.text('DDGRS — Grievance Report', pageW / 2, 12, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageW / 2, 22, { align: 'center' })
      doc.setTextColor(0, 0, 0)

      const addLine = (label: string, value: string) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
        doc.text(label, margin, y)
        doc.setFont('helvetica', 'normal')
        const lines = doc.splitTextToSize(value, pageW - margin * 2 - doc.getTextWidth(label) - 2)
        doc.text(lines, margin + doc.getTextWidth(label) + 2, y)
        y += 7 * lines.length
        if (y > 270) { doc.addPage(); y = 20 }
      }

      addLine('Grievance ID: ', grievance.grievance_id)
      addLine('Category: ', grievance.category)
      addLine('Status: ', grievance.status)
      addLine('Submitted: ', formatDate(grievance.created_at))
      addLine('Assigned To: ', grievance.assigned_member_name || 'Unassigned')
      if (!grievance.is_anonymous) {
        addLine('Student: ', grievance.user_name || 'N/A')
        addLine('Role: ', grievance.user_role || 'N/A')
      } else {
        addLine('Identity: ', 'Anonymous')
      }
      y += 4
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text('Description:', margin, y); y += 6
      doc.setFont('helvetica', 'normal')
      const descLines = doc.splitTextToSize(grievance.description || '', pageW - margin * 2)
      doc.text(descLines, margin, y); y += 6 * descLines.length + 8

      // Actions
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.setFillColor(30, 64, 175)
      doc.rect(margin, y - 5, pageW - margin * 2, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text(`Action History (${(actions as GrievanceAction[]).length})`, margin + 2, y)
      doc.setTextColor(0, 0, 0); y += 8

      if ((actions as GrievanceAction[]).length === 0) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(10)
        doc.text('No actions taken yet.', margin, y)
      } else {
        (actions as GrievanceAction[]).forEach((a, i) => {
          if (y > 260) { doc.addPage(); y = 20 }
          doc.setFillColor(245, 247, 250)
          doc.rect(margin, y - 4, pageW - margin * 2, 6, 'F')
          doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
          doc.setTextColor(30, 64, 175)
          doc.text(`${i + 1}. ${a.new_status}`, margin + 2, y)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
          doc.text(`${a.admin_name}  |  ${formatDate(a.created_at)}`, pageW - margin, y, { align: 'right' })
          y += 7
          if (a.remarks) {
            const rLines = doc.splitTextToSize(`Remarks: ${a.remarks}`, pageW - margin * 2 - 4)
            doc.text(rLines, margin + 4, y); y += 5 * rLines.length
          }
          y += 3
        })
      }

      doc.save(`Grievance_${grievance.grievance_id}_Report.pdf`)
    } finally {
      setGenerating(false)
    }
  }

  if (isLoading) return <div className="p-8">Loading...</div>

  return (
    <div className="p-4 lg:p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Reports</h1>

      {/* ── Download Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* By time period */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Download by Time Period</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={downloadPeriodReport} disabled={generating}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 font-medium">
              {generating ? 'Generating...' : '⬇ Download Period Report'}
            </button>
          </div>
        </div>

        {/* By grievance ID */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Download by Grievance ID</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grievance ID</label>
              <input type="text" value={searchId} onChange={e => setSearchId(e.target.value)}
                placeholder="e.g. GRV-000042"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={downloadGrievanceReport} disabled={generating}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 font-medium">
              {generating ? 'Generating...' : '⬇ Download Grievance Report'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Category Distribution</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-[350px] flex items-center justify-center text-gray-500">No data</div>}
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Status Breakdown</h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" labelLine label={({ name, value }) => `${name}: ${value}`} outerRadius={100} dataKey="value">
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-[350px] flex items-center justify-center text-gray-500">No data</div>}
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: grievances.length, color: 'text-gray-900 dark:text-white' },
          { label: 'Active', value: grievances.filter(g => !['Resolved','Closed','Rejected'].includes(g.status)).length, color: 'text-blue-600' },
          { label: 'Resolved', value: grievances.filter(g => g.status === 'Resolved' || g.status === 'Closed').length, color: 'text-green-600' },
          { label: 'Resolution Rate', value: grievances.length ? `${Math.round((grievances.filter(g => g.status === 'Resolved' || g.status === 'Closed').length / grievances.length) * 100)}%` : '0%', color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">{s.label}</div>
            <div className={`text-3xl font-bold mt-2 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
