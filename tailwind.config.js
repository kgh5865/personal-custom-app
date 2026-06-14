/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--md-sys-color-primary)',
        'on-primary': 'var(--md-sys-color-on-primary)',
        'primary-container': 'var(--md-sys-color-primary-container)',
        'on-primary-container': 'var(--md-sys-color-on-primary-container)',
        'secondary-container': 'var(--md-sys-color-secondary-container)',
        'on-secondary-container': 'var(--md-sys-color-on-secondary-container)',
        surface: 'var(--md-sys-color-surface)',
        'surface-container': 'var(--md-sys-color-surface-container)',
        'surface-container-high': 'var(--md-sys-color-surface-container-high)',
        'surface-container-highest': 'var(--md-sys-color-surface-container-highest)',
        'on-surface': 'var(--md-sys-color-on-surface)',
        'on-surface-variant': 'var(--md-sys-color-on-surface-variant)',
        outline: 'var(--md-sys-color-outline)',
        'outline-variant': 'var(--md-sys-color-outline-variant)',
        'md-error': 'var(--md-sys-color-error)',
        'on-md-error': 'var(--md-sys-color-on-error)',
      },
      borderRadius: {
        'md-sm': '8px',
        'md-md': '12px',
        'md-lg': '16px',
        'md-xl': '28px',
      },
      boxShadow: {
        'md-1': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px 1px rgba(0,0,0,0.15)',
        'md-2': '0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)',
      },
    },
  },
  plugins: [],
};
