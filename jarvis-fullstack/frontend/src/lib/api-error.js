/**
 * Extract a human-readable error message from an axios error.
 * Handles Pydantic 422 lists, single-string `detail`, and network errors.
 */
export function apiErrorMessage(err, fallback = 'Something went wrong') {
  if (!err) return fallback;
  const detail = err.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg || 'Invalid input').join(', ');
  }
  if (typeof detail === 'string') return detail;
  if (err.message === 'Network Error') {
    return 'Cannot reach the server. Is the backend running?';
  }
  return err.message || fallback;
}
