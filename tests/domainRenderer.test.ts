import { describe, it, expect } from 'vitest';
import { inlineAssets } from '../src/lib/domainRenderer';

describe('inlineAssets', () => {
  it('inlines CSS in place of <link href="style.css">', () => {
    const out = inlineAssets({
      html: '<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>',
      css: 'body { color: red; }',
      js: '',
    });
    expect(out).toContain('<style>body { color: red; }</style>');
    expect(out).not.toContain('href="style.css"');
  });

  it('inlines JS in place of <script src="script.js">', () => {
    const out = inlineAssets({
      html: '<html><body><script src="script.js"></script></body></html>',
      css: '',
      js: 'console.log(1);',
    });
    expect(out).toContain('<script>console.log(1);</script>');
    expect(out).not.toContain('src="script.js"');
  });

  it('handles single-quoted href', () => {
    const out = inlineAssets({
      html: "<html><head><link rel='stylesheet' href='style.css' /></head><body></body></html>",
      css: 'p { padding: 0; }',
      js: '',
    });
    expect(out).toContain('<style>p { padding: 0; }</style>');
  });

  it('escapes </script> inside JS to prevent breakout', () => {
    const out = inlineAssets({
      html: '<html><body><script src="script.js"></script></body></html>',
      css: '',
      js: 'var x = "</script><img src=x onerror=alert(1)>";',
    });
    // The injected </script> must be escaped
    expect(out).toContain('<\\/script>');
    // Original closing tag from the placeholder still gone
    expect(out.split('<script>').length).toBe(2); // exactly one opening script tag
  });

  it('escapes </style> inside CSS to prevent breakout', () => {
    const out = inlineAssets({
      html: '<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>',
      css: 'body::before { content: "</style><script>x</script>"; }',
      js: '',
    });
    expect(out).toContain('<\\/style>');
  });

  it('handles case-insensitive </SCRIPT>', () => {
    const out = inlineAssets({
      html: '<html><body><script src="script.js"></script></body></html>',
      css: '',
      js: 'x; </SCRIPT> y;',
    });
    expect(out).toContain('<\\/SCRIPT>');
  });

  it('falls back to injecting before </head> if no link tag present', () => {
    const out = inlineAssets({
      html: '<html><head><title>t</title></head><body></body></html>',
      css: 'a {}',
      js: '',
    });
    expect(out).toContain('<style>a {}</style>');
  });

  it('falls back to injecting before </body> if no script tag present', () => {
    const out = inlineAssets({
      html: '<html><head></head><body>hello</body></html>',
      css: '',
      js: 'alert(1)',
    });
    expect(out).toContain('<script>alert(1)</script>');
  });
});
