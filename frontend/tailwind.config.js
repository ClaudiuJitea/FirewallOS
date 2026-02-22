/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#F5F5F5',
                sidebar: '#1E1E2E',
                card: '#2D2D3F',
                primary: {
                    DEFAULT: '#00897B',
                    foreground: '#FFFFFF',
                },
                danger: {
                    DEFAULT: '#E57373',
                    foreground: '#FFFFFF',
                },
                warning: {
                    DEFAULT: '#FFB74D',
                    foreground: '#1E1E2E',
                },
                text: {
                    dark: '#E2E8F0',
                    light: '#1E293B',
                    muted: '#94A3B8'
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
