// The message to show for a failed request: the server's own wording when there is one, otherwise the fallback.
export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}
