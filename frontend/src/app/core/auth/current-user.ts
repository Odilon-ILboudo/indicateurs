export function getCurrentUserId(): string {
  const stored = localStorage.getItem('currentUser')
  return stored ? JSON.parse(stored).id ?? '' : ''
}
