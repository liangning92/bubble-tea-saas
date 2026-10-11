import { useTranslation } from 'react-i18next'
import { trainingCopy } from '../../../shared/utils/trainingCopy'
import { useState } from 'react'
import { TrainingLibrary } from '../components/TrainingLibrary'
import { TrainingLibraryEditor } from '../components/TrainingLibraryEditor'
import { useAuthStore } from '../stores/auth'
export function TrainingLibraryPage({ embedded = false }: { embedded?: boolean }) {
  const { i18n } = useTranslation()
  const w = trainingCopy(i18n.language)
  const { token, user } = useAuthStore()
  const [editing, setEditing] = useState(false)
  if (editing && user?.role === 'admin') return <TrainingLibraryEditor token={token} onClose={() => setEditing(false)} />
  return <>{user?.role === 'admin' && <button className='m-4 btn-primary' onClick={() => setEditing(true)}>{w.editMaterial}</button>}<TrainingLibrary embedded={embedded} token={token} recordsPath='/staff/training?tab=records' /></>
}
