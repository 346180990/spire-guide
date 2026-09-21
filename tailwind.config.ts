import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  mode: 'jit',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      utilities: {
        ".unicode-isolate": {
          "unicode-bidi": "isolate",
        },
      },
      borderColor: {
        "custom-rgba": "rgba(184, 197, 214, 0.2)",
      },
      keyframes: {
        slideDown: {
          "0%": { transform: "translateY(-70px)" },
          "100%": { transform: "translateY(0)" },
        },
        slideUp: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-70px)" },
        },
        fadeIn: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        slideDown: "slideDown 0.5s ease-out both",
        slideUp: "slideUp 0.5s ease-out both",
        fadeIn: "fadeIn 0.5s ease-in-out",
      },

      animationFillMode: {
        none: "none",
        forwards: "forwards",
        backwards: "backwards",
        both: "both",
      },

      backgroundSize: {
        custom: "40px auto",
      },
      backgroundImage: {
        "article-icon": "url('/bg-ico.png')",
      },
      transitionTimingFunction: {
        "custom-cubic": "cubic-bezier(0.61, 0.04, 0.17, 1.32)",
      },
      transitionDuration: {
        400: "400ms",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        grayCustom: "#767676",
        blackCustom: "#313131",
        title: "#5f5f5f",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Noto Sans"',
          "Ubuntu",
          "Cantarell",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#333",
            a: {
              color: "#1a73e8",
              "&:hover": {
                color: "#00ffff",
              },
            },
            blockquote: {
              fontStyle: "italic",
              borderLeftColor: "#1a73e8",
            },
            "code::before": false,
            "code::after": false,
            code: {
              color: "#d6336c",
              backgroundColor: "#f8f9fa",
              padding: "2px 4px",
              borderRadius: "4px",
            },
          },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
