import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Grievance } from '../types'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function Reports() {
  const { data: grievances = [], isLoading } = useQuery({
    queryKey: ['grievances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grievances')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as Grievance[]
    },
  })

  const categories = [
    'Academic', 'Examination', 'Infrastructure', 'Hostel',
    'Library', 'Administration', 'IT / Network', 
    'Discipline / Harassment', 'Other'
  ]

  // Category Distribution Data
  const categoryData = categories.map(category => ({
    name: category,
    count: grievances.filter(g => g.category === category).length
  })).filter(item => item.count > 0)

  // Status Breakdown Data
  const statusData = [
    { name: 'Submitted', value: grievances.filter(g => g.status === 'Submitted').length, color: '#3B82F6' },
    { name: 'Acknowledged', value: grievances.filter(g => g.status === 'Acknowledged').length, color: '#60A5FA' },
    { name: 'Under Review', value: grievances.filter(g => g.status === 'Under Review').length, color: '#F59E0B' },
    { name: 'In Progress', value: grievances.filter(g => g.status === 'In Progress').length, color: '#FB923C' },
    { name: 'Awaiting Confirmation', value: grievances.filter(g => g.status === 'Awaiting Confirmation').length, color: '#8B5CF6' },
    { name: 'Resolved', value: grievances.filter(g => g.status === 'Resolved').length, color: '#10B981' },
    { name: 'Closed', value: grievances.filter(g => g.status === 'Closed').length, color: '#6B7280' },
    { name: 'Rejected', value: grievances.filter(g => g.status === 'Rejected').length, color: '#EF4444' },
  ].filter(item => item.value > 0)

  if (isLoading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports</h1>

      {/* Charts Section */}
      <div className="grid grid-cols-2 gap-6">
        {/* Category Distribution Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Category Distribution</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={120}
                  interval={0}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFF', 
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-gray-500">
              No data available
            </div>
          )}
        </div>

        {/* Status Breakdown Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Breakdown</h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFF', 
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-gray-500">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="mt-8 grid grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-600">Total Grievances</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{grievances.length}</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-600">Active Cases</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {grievances.filter(g => 
              g.status !== 'Resolved' && 
              g.status !== 'Closed' && 
              g.status !== 'Rejected'
            ).length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-600">Resolved</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {grievances.filter(g => g.status === 'Resolved' || g.status === 'Closed').length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-600">Resolution Rate</div>
          <div className="text-3xl font-bold text-purple-600 mt-2">
            {grievances.length > 0 
              ? Math.round((grievances.filter(g => g.status === 'Resolved' || g.status === 'Closed').length / grievances.length) * 100)
              : 0}%
          </div>
        </div>
      </div>
    </div>
  )
}
