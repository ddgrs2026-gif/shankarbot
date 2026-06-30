import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Grievance } from '../types'
import { getStatusColor, formatDate } from '../lib/utils'

export default function MyGrievances() {
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [loading, setLoading] = useState(true)
  const [adminName, setAdminName] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      const name = profile?.full_name || ''
      setAdminName(name)

      const { data } = await supabase
        .from('grievances')
        .select('*')
        .eq('assigned_member_name', name)
        .order('created_at', { ascending: false })

      setGrievances(data || [])
      setLoading(false)
    }
    init()

    // Real-time updates
    const channel = supabase
      .channel('my-grievances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grievances' },
        async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          const name = profile?.full_name || ''
          const { data } = await supabase.from('grievances').select('*').eq('assigned_member_name', name).order('created_at', { ascending: false })
          setGrievances(data || [])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const pending = grievances.filter(g => g.status === 'Submitted' || g.status === 'Acknowledged').length
  const resolved = grievances.filter(g => g.status === 'Resolved' || g.status === 'Closed').length

  if (loading) return <div className="p-8 text-gray-900 dark:text-white">Loading...</div>

  return (
    <div className="p-4 lg:p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">My Grievances</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Assigned to: {adminName || 'You'}</p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Assigned', value: grievances.length, color: 'text-gray-900 dark:text-white' },
          { label: 'Pending', value: pending, color: 'text-yellow-600 dark:text-yellow-400' },
          { label: 'Resolved', value: resolved, color: 'text-green-600 dark:text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 p-5 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">{s.label}</div>
            <div className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {['Grievance ID', 'Category', 'Status', 'Submitted By', 'Assigned On', 'Date'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {grievances.map(g => (
              <tr key={g.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link to={`/grievances/${g.id}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    {g.grievance_id}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200">{g.category}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(g.status)}`}>{g.status}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200">
                  {g.is_anonymous ? <span className="italic text-gray-400">Anonymous</span> : g.user_name || 'Identified'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {g.assigned_at ? formatDate(g.assigned_at) : '—'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(g.created_at)}</td>
              </tr>
            ))}
            {grievances.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No grievances assigned to you yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
