import { useContext } from 'react'
import { UserContext } from '../UserContext.jsx'

/**
 * Hook to access and update currentUser from the UserContext.
 * Profile data is fetched exclusively from the Supabase cloud server —
 * no localStorage or sessionStorage is used.
 *
 * @returns {[object|null, function]} [currentUser, setCurrentUser]
 */
export function useCurrentUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useCurrentUser must be used within a UserProvider')
  }
  return [context.currentUser, context.setCurrentUser]
}
