/** OPF · Fluxo — design tokens mapeados para o Tailwind */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void: '#090D18',
        deep: '#121A2B',
        surface: '#1B2740',
        azure: '#4DA6FF',
        indigo: '#6366F1',
        sky: '#BFE0FF',
        paper: '#F0F6FF',
        muted: '#93A4C4',
        faint: '#56627E',
        positive: '#4FD1A6',
        caution: '#F2B872',
        line: 'rgba(255,255,255,0.08)',
        'line-soft': 'rgba(255,255,255,0.05)'
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        s: '10px',
        m: '16px',
        l: '22px'
      },
      backgroundImage: {
        aurora: 'linear-gradient(135deg, #4DA6FF, #6366F1)'
      }
    }
  },
  plugins: []
};
