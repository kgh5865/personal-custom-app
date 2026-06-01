import type { DomainFiles } from './domains';

/** Escape </style> sequences so they don't prematurely close an inlined style block. Preserves original tag casing. */
export function escapeForStyle(css: string): string {
  return css.replace(/<\/style>/gi, (m) => '<\\/' + m.slice(2));
}

/** Escape </script> sequences so they don't prematurely close an inlined script block. Preserves original tag casing. */
export function escapeForScript(js: string): string {
  return js.replace(/<\/script>/gi, (m) => '<\\/' + m.slice(2));
}

const STYLE_TAG_OPEN = '<' + 'style>';
const STYLE_TAG_CLOSE = '</' + 'style>';
const SCRIPT_TAG_CLOSE = '</' + 'script>';
const HEAD_CLOSE = '</' + 'head>';
const BODY_CLOSE = '</' + 'body>';

/**
 * Inline CSS and JS into the HTML so the iframe srcdoc is fully self-contained.
 * Replaces <link href="style.css"> and <script src="script.js"></script> if present,
 * and falls back to appending at end of </head> / </body> if not found.
 */
export function inlineAssets(files: DomainFiles): string {
  let html = files.html;

  // Replace <link rel="stylesheet" href="style.css"> with inline <style>
  const cssInlined = STYLE_TAG_OPEN + escapeForStyle(files.css) + STYLE_TAG_CLOSE;
  html = html.replace(/<link[^>]*href=["']style\.css["'][^>]*>/, cssInlined);

  // Replace <script src="script.js"></script> with inline <script>
  const jsTag = '<' + 'script>';
  const jsInlined = jsTag + escapeForScript(files.js) + SCRIPT_TAG_CLOSE;
  html = html.replace(/<script[^>]*src=["']script\.js["'][^>]*><\/script>/, jsInlined);

  // Fallback: append at </head> / </body> if not already inlined
  if (!html.includes(STYLE_TAG_OPEN) && files.css) {
    html = html.replace(HEAD_CLOSE, cssInlined + HEAD_CLOSE);
  }
  if (!html.includes(jsTag) && files.js) {
    html = html.replace(BODY_CLOSE, jsInlined + BODY_CLOSE);
  }

  return html;
}
