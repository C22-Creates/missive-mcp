/**
 * HTML page for the PAT authorization form.
 * Users paste their Missive API token here during the OAuth flow.
 */

export interface AuthorizeFormParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  error?: string;
}

export function renderAuthorizeForm(params: AuthorizeFormParams): string {
  const errorHtml = params.error
    ? `<div class="error">${escapeHtml(params.error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect to Missive MCP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 40px; max-width: 440px; width: 100%; }
    h1 { font-size: 1.4em; margin-bottom: 8px; color: #1a1a1a; }
    p { color: #666; font-size: 0.9em; margin-bottom: 24px; line-height: 1.5; }
    label { display: block; font-weight: 600; font-size: 0.85em; color: #333; margin-bottom: 8px; }
    input[type="password"] { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95em; font-family: monospace; }
    input[type="password"]:focus { outline: none; border-color: #4a90d9; box-shadow: 0 0 0 3px rgba(74,144,217,0.15); }
    button { width: 100%; padding: 12px; background: #4a90d9; color: white; border: none; border-radius: 6px; font-size: 1em; font-weight: 600; cursor: pointer; margin-top: 20px; }
    button:hover { background: #3a7bc8; }
    button:disabled { background: #999; cursor: not-allowed; }
    .error { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 6px; font-size: 0.85em; margin-bottom: 16px; border: 1px solid #fecaca; }
    .help { font-size: 0.8em; color: #999; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect to Missive</h1>
    <p>Paste your Missive API token to authorize this MCP client. Your token will be encrypted and stored securely.</p>
    ${errorHtml}
    <form method="POST" action="/authorize-submit">
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}">
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}">
      <input type="hidden" name="state" value="${escapeAttr(params.state || '')}">
      <label for="pat">Missive API Token</label>
      <input type="password" id="pat" name="pat" required minlength="20" placeholder="Paste your API token" autocomplete="off">
      <button type="submit">Authorize</button>
      <p class="help">Find your API token in Missive Settings &rarr; API.</p>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
