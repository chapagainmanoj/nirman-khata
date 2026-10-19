export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * An error the app shows. `message` is plain English for people; `code` is stable, so the app can
 * show its own (translated) words for it (app/src/lib/errors.ts, `function.<code>`).
 */
export function fail(message: string, status = 400, code?: string): Response {
  return json(code ? { error: message, code } : { error: message }, status)
}

export const MIN_PASSWORD_LENGTH = 8
