import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, FileText, Search, BarChart3, LogOut, Sun, Moon, Users, Star, ClipboardList, Menu, X } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useState } from 'react'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/grievances', icon: FileText, label: 'All Grievances' },
    { to: '/my-grievances', icon: ClipboardList, label: 'My Grievances' },
    { to: '/feedback', icon: Star, label: 'Feedback' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
    { to: '/search', icon: Search, label: 'Search' },
    { to: '/admin-profiles', icon: Users, label: 'Admin Profiles' },
  ]

  const navLink = (to: string) =>
    `flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
      location.pathname === to
        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      <div className="p-5 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">DDGRS Admin</h1>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Toggle dark mode">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-md text-gray-500 lg:hidden" aria-label="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className={navLink(to)} onClick={() => setSidebarOpen(false)}>
            <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <button onClick={handleLogout} className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
          <LogOut className="w-5 h-5 mr-3" />Logout
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
        <div className="w-full">
          <Sidebar />
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-72 z-50">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-gray-900 dark:text-white">DDGRS Admin</h1>
          <button onClick={toggle} className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
