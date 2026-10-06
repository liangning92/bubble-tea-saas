import { useState } from 'react'
import { TrainingLibrary } from '../components/TrainingLibrary'
import { TrainingLibraryEditor } from '../components/TrainingLibraryEditor'
import { useAuthStore } from '../stores/auth'
export function TrainingLibraryPage({ embedded = false }: { embedded?: boolean }) {
  const { token, user } = useAuthStore()
  const [editing, setEditing] = useState(false)
  if (editing && user?.role === 'admin') return <TrainingLibraryEditor token={token} onClose={() => setEditing(false)} />
  return <>{user?.role === 'admin' && <button className='m-4 border rounded p-2' onClick={() => setEditing(true)}>编辑培训资料 / Edit materi</button>}<TrainingLibrary embedded={embedded} token={token} recordsPath='/staff/training?tab=records' /></>
}
