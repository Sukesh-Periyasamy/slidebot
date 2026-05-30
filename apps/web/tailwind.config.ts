/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // SlideBot brand palette — IndiGo-inspired deep navy + electric blue
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd4ff',
          300: '#8ebaff',
          400: '#5996ff',
          500: '#0066FF', // Primary — electric blue
          600: '#0052d6',
          700: '#0042ad',
          800: '#00368f',
          900: '#002d75',
          950: '#001a47',
        },
        // Neutral grays (warm-tinted for premium feel)
        surface: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e8e8e8',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
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
        'glow-brand': '0 0 20px rgba(0, 102, 255, 0.25)',
        'glow-sm': '0 0 10px rgba(0, 102, 255, 0.15)',
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)',
        panel: '0 8px 32px rgba(0,0,0,0.12)',
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
