import { TrainingLibrary } from '../components/TrainingLibrary'
import { useAuthStore } from '../stores/auth'
export function TrainingLibraryPage({ embedded = false }: { embedded?: boolean }) {
  const { token } = useAuthStore()
  return <TrainingLibrary embedded={embedded} token={token} recordsPath='/training?tab=records' />
}
