import { Navigate } from 'react-router-dom'
/** Old bookmarks now open the same learning centre and its saved progress. */
export function TrainingLibraryPage() {
  return <Navigate to="/training" replace />
}
