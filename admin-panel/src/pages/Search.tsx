import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Grievance } from '../types'
import { getStatusColor, formatDate } from '../lib/utils'

export default function Search() {
  const [searchId, setSearchId] = useState('')
  const [result, setResult] = useState<Grievance | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const { data, error } = await supabase
        .from('grievances')
        .select('*')
        .eq('grievance_id', searchId.toUpperCase())
        .single()

      if (error) throw new Error('Grievance not found')
      setResult(data as Grievance)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Search Grievance</h1>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Enter Grievance ID (e.g., GRV-000001)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{result.grievance_id}</h2>
                <p className="text-sm text-gray-600 mt-1">{result.category}</p>
              </div>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(result.status)}`}>
                {result.status}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <span className="font-medium text-gray-700">Description:</span>
                <p className="mt-1 text-gray-900">{result.description}</p>
              </div>

              <div>
                <span className="font-medium text-gray-700">Submitted:</span>
                <span className="ml-2 text-gray-900">{formatDate(result.created_at)}</span>
              </div>

              <div>
                <span className="font-medium text-gray-700">Identity:</span>
                <span className="ml-2 text-gray-900">
                  {result.is_anonymous ? 'Anonymous' : result.user_name || 'Identified'}
                </span>
              </div>

              <Link
                to={`/grievances/${result.id}`}
                className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                View Full Details
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
