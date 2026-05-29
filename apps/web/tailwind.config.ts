/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // SlideBot brand palette — premium light design
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d7fe',
          300: '#a5bbfc',
          400: '#8199f8',
          500: '#6173f2', // Primary brand
          600: '#4e55e6',
          700: '#3f43cc',
          800: '#3438a4',
          900: '#2f3482',
          950: '#1d1f4e',
        },
        // Neutral grays (cool-tinted for dark mode)
        surface: {
          50: '#f8f9fb',
          100: '#f1f3f7',
          200: '#e4e8f0',
          300: '#cdd3df',
          400: '#9aa5b8',
          500: '#6b778d',
          600: '#4a5568',
          700: '#2d3748',
          800: '#1a2035',
          900: '#111827',
          950: '#080c14',
        },
        // Premium accent (warm gold for subtle highlights)
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Presence colors for collaborators
        presence: {
          1: '#6366F1',
          2: '#EC4899',
          3: '#F59E0B',
          4: '#10B981',
          5: '#3B82F6',
          6: '#8B5CF6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.15s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'cursor-blink': 'cursorBlink 1s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        cursorBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(97, 115, 242, 0.3)',
        'glow-sm': '0 0 10px rgba(97, 115, 242, 0.2)',
        card: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.1)',
        panel: '0 8px 32px rgba(0,0,0,0.24)',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
      spacing: {
        'density-base': 'var(--spacing-base)',
        'density-card': 'var(--card-padding)',
      },
      height: {
        'toolbar': 'var(--toolbar-height)',
      },
      width: {
        'toolbar': 'var(--toolbar-height)',
      },
      fontSize: {
        'density-base': 'var(--font-size-base)',
      }
    },
  },
  plugins: [],
};
