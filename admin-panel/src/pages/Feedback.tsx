import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GrievanceFeedback } from '../types'
import { formatDate } from '../lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const RATING_LABELS: Record<number, string> = {
  1: 'Very Dissatisfied', 2: 'Dissatisfied', 3: 'Neutral', 4: 'Satisfied', 5: 'Very Satisfied'
}
const RATING_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#10B981']

export default function Feedback() {
  const [feedbacks, setFeedbacks] = useState<GrievanceFeedback[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFeedback = async () => {
      const { data, error } = await supabase
        .from('grievance_feedback')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error) setFeedbacks(data || [])
      setLoading(false)
    }
    fetchFeedback()

    // Real-time subscription
    const channel = supabase
      .channel('feedback-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'grievance_feedback' },
        (payload) => setFeedbacks(prev => [payload.new as GrievanceFeedback, ...prev])
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const avg = feedbacks.length
    ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1)
    : '—'

  const ratingDist = [1, 2, 3, 4, 5].map(r => ({
    name: RATING_LABELS[r],
    value: feedbacks.filter(f => f.rating === r).length,
    color: RATING_COLORS[r - 1]
  })).filter(d => d.value > 0)

  if (loading) return <div className="p-8 text-gray-900 dark:text-white">Loading...</div>

  return (
    <div className="p-4 lg:p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Student Feedback</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Responses</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{feedbacks.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">Average Rating</div>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">{avg} / 5</div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">Satisfied & Above</div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
            {feedbacks.length ? Math.round((feedbacks.filter(f => f.rating >= 4).length / feedbacks.length) * 100) : 0}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Rating distribution chart */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Rating Distribution</h2>
          {ratingDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={ratingDist} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}>
                  {ratingDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">No data yet</div>
          )}
        </div>

        {/* Rating breakdown */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Breakdown</h2>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map(r => {
              const count = feedbacks.filter(f => f.rating === r).length
              const pct = feedbacks.length ? Math.round((count / feedbacks.length) * 100) : 0
              return (
                <div key={r} className="flex items-center gap-3">
                  <span className="text-sm w-4 text-gray-700 dark:text-gray-300">{r}⭐</span>
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div className="h-3 rounded-full" style={{ width: `${pct}%`, backgroundColor: RATING_COLORS[r - 1] }} />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-8">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Feedback table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {['Grievance ID', 'Rating', 'Comments', 'Date'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {feedbacks.map(f => (
              <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-6 py-4 text-sm font-medium text-blue-600 dark:text-blue-400">{f.grievance_id}</td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200">
                  <span style={{ color: RATING_COLORS[f.rating - 1] }}>{'⭐'.repeat(f.rating)}</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs">{RATING_LABELS[f.rating]}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                  {f.comments || <span className="italic text-gray-400">No comments</span>}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(f.created_at)}</td>
              </tr>
            ))}
            {feedbacks.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No feedback yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
