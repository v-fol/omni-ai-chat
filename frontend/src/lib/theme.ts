export const theme = {
  colors: {
    // Base colors
    background: {
      primary: 'hsl(0 0% 100%)', // White
      secondary: 'hsl(0 0% 98%)', // Off-white
      dark: {
        primary: 'hsl(0 0% 10%)', // Dark gray
        secondary: 'hsl(0 0% 15%)', // Slightly lighter dark gray
      },
    },
    text: {
      primary: 'hsl(0 0% 10%)', // Dark gray
      secondary: 'hsl(0 0% 40%)', // Medium gray
      light: {
        primary: 'hsl(0 0% 98%)', // Off-white
        secondary: 'hsl(0 0% 90%)', // Light gray
      },
    },
    accent: {
      yellow: 'hsl(45 100% 50%)', // Bright yellow
      blue: 'hsl(210 100% 50%)', // Bright blue
    },
    border: {
      light: 'hsl(0 0% 90%)',
      dark: 'hsl(0 0% 20%)',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '1rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  },
} as const;

export type Theme = typeof theme; 