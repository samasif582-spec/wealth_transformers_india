import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border, 214.3 31.8% 91.4%))',
        input: 'hsl(var(--input, 214.3 31.8% 91.4%))',
        ring: 'hsl(var(--ring, 222.2 84% 4.9%))',
        background: 'hsl(var(--background, 0 0% 100%))',
        foreground: 'hsl(var(--foreground, 222.2 84% 4.9%))',
        primary: {
          DEFAULT: 'hsl(var(--primary, 222.2 47.4% 11.2%))',
          foreground: 'hsl(var(--primary-foreground, 210 40% 98%))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary, 210 40% 96.1%))',
          foreground: 'hsl(var(--secondary-foreground, 222.2 47.4% 11.2%))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive, 0 84.2% 60.2%))',
          foreground: 'hsl(var(--destructive-foreground, 210 40% 98%))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted, 210 40% 96.1%))',
          foreground: 'hsl(var(--muted-foreground, 215.4 16.3% 46.9%))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent, 210 40% 96.1%))',
          foreground: 'hsl(var(--accent-foreground, 222.2 47.4% 11.2%))',
        },
        apple: {
          blue: {
            DEFAULT: '#0071E3',
            hover: '#0077ED',
            dark: '#0A84FF',
          },
          emerald: {
            DEFAULT: '#34C759',
            hover: '#30D158',
            dark: '#30D158',
          },
          indigo: {
            DEFAULT: '#5856D6',
            dark: '#5E5CE6',
          },
          purple: {
            DEFAULT: '#AF52DE',
            dark: '#BF5AF2',
          },
          orange: {
            DEFAULT: '#FF9500',
            dark: '#FF9F0A',
          },
          red: {
            DEFAULT: '#FF3B30',
            dark: '#FF453A',
          },
          gray: {
            50: '#FBFBFD',
            100: '#F5F5F7',
            200: '#E5E5EA',
            300: '#D1D1D6',
            400: '#C7C7CC',
            500: '#8E8E93',
            600: '#636366',
            700: '#48484A',
            800: '#2C2C2E',
            900: '#1C1C1E',
            950: '#0E1013',
          },
        },
      },
      borderRadius: {
        lg: 'var(--radius, 0.5rem)',
        md: 'calc(var(--radius, 0.5rem) - 2px)',
        sm: 'calc(var(--radius, 0.5rem) - 4px)',
        'squircle-sm': '12px',
        'squircle-md': '18px',
        'squircle-lg': '24px',
        'squircle-xl': '28px',
        'squircle-2xl': '32px',
      },
      boxShadow: {
        specular: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.12)',
        'specular-light': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.8)',
        'apple-card': '0 4px 24px -1px rgba(0, 0, 0, 0.05), 0 2px 8px -1px rgba(0, 0, 0, 0.03)',
        'apple-card-dark': '0 12px 36px -4px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'apple-sheet': '0 24px 64px -12px rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
      },
    },
  },
  plugins: [],
};

export default config;
