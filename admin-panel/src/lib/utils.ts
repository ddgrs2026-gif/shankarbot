import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    'Submitted': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'Acknowledged': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    'Under Review': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    'In Progress': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    'Awaiting Confirmation': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    'Resolved': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    'Closed': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    'Rejected': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}
