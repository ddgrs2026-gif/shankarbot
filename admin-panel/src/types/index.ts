export type GrievanceStatus = 
  | 'Submitted' | 'Acknowledged' | 'Under Review' | 'In Progress'
  | 'Awaiting Confirmation' | 'Resolved' | 'Closed' | 'Rejected'

export type GrievanceCategory =
  | 'Academic' | 'Examination' | 'Infrastructure' | 'Hostel'
  | 'Library' | 'Administration' | 'IT / Network'
  | 'Discipline / Harassment' | 'Other'

export interface Grievance {
  id: string
  grievance_id: string
  category: GrievanceCategory
  description: string
  is_anonymous: boolean
  user_id: string | null
  user_name: string | null
  user_role: string | null
  user_department: string | null
  image_url: string | null
  video_url: string | null
  status: GrievanceStatus
  created_at: string
  updated_at: string
}

export interface GrievanceAction {
  id: string
  grievance_id: string
  action_by: string
  admin_name: string
  remarks: string | null
  new_status: GrievanceStatus
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  created_at: string
}
