/**
 * Next signals redirects and not-found by throwing, and marks those errors with
 * a `digest`. An action that catches everything would turn "go to the sign-in
 * screen" into the words NEXT_REDIRECT shown to the person filling in a form,
 * so every catch rethrows them before deciding what to report.
 */
export function rethrowControlFlow(err: unknown): void {
  if (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test((err as { digest: string }).digest)
  ) {
    throw err;
  }
}
