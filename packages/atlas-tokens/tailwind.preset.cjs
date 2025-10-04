module.exports = {
  "theme": {
    "extend": {
      "colors": {
        "background": {
          "canvas": "var(--atlas-color-background-canvas)",
          "muted": "var(--atlas-color-background-muted)",
          "inset": "var(--atlas-color-background-inset)"
        },
        "surface": {
          "default": "var(--atlas-color-surface-default)",
          "raised": "var(--atlas-color-surface-raised)",
          "overlay": "var(--atlas-color-surface-overlay)"
        },
        "border": {
          "subtle": "var(--atlas-color-border-subtle)",
          "default": "var(--atlas-color-border-default)",
          "emphasis": "var(--atlas-color-border-emphasis)"
        },
        "content": {
          "primary": "var(--atlas-color-content-primary)",
          "secondary": "var(--atlas-color-content-secondary)",
          "muted": "var(--atlas-color-content-muted)",
          "inverse": "var(--atlas-color-content-inverse)"
        },
        "accent": {
          "primary": "var(--atlas-color-accent-primary)",
          "positive": "var(--atlas-color-accent-positive)",
          "warning": "var(--atlas-color-accent-warning)",
          "critical": "var(--atlas-color-accent-critical)",
          "info": "var(--atlas-color-accent-info)"
        },
        "status": {
          "success-surface": "var(--atlas-color-status-success-surface)",
          "warning-surface": "var(--atlas-color-status-warning-surface)",
          "critical-surface": "var(--atlas-color-status-critical-surface)"
        },
        "focus": {
          "ring": "var(--atlas-color-focus-ring)"
        }
      },
      "spacing": {
        "none": "0px",
        "3xs": "0.125rem",
        "2xs": "0.25rem",
        "xs": "0.375rem",
        "sm": "0.5rem",
        "md": "0.75rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "2xl": "2rem",
        "3xl": "3rem",
        "4xl": "4rem"
      },
      "borderRadius": {
        "none": "0px",
        "xs": "0.25rem",
        "sm": "0.375rem",
        "md": "0.5rem",
        "lg": "0.75rem",
        "xl": "1rem",
        "pill": "9999px"
      },
      "boxShadow": {
        "flat": "var(--atlas-elevation-flat)",
        "raised": "var(--atlas-elevation-raised)",
        "overlay": "var(--atlas-elevation-overlay)",
        "focus": "var(--atlas-elevation-focus)",
        "inset": "var(--atlas-elevation-inset)"
      },
      "fontFamily": {
        "sans": "'Inter', 'SF Pro Display', 'Segoe UI', sans-serif",
        "serif": "'IBM Plex Serif', 'Georgia', serif",
        "mono": "'JetBrains Mono', 'Menlo', monospace"
      },
      "fontSize": {
        "xs": [
          "0.75rem",
          {
            "lineHeight": "1.2"
          }
        ],
        "sm": [
          "0.875rem",
          {
            "lineHeight": "1.4"
          }
        ],
        "body": [
          "1rem",
          {
            "lineHeight": "1.55"
          }
        ],
        "lg": [
          "1.125rem",
          {
            "lineHeight": "1.55"
          }
        ],
        "xl": [
          "1.5rem",
          {
            "lineHeight": "1.4"
          }
        ],
        "2xl": [
          "2rem",
          {
            "lineHeight": "1.2"
          }
        ],
        "display": [
          "2.75rem",
          {
            "lineHeight": "1.1"
          }
        ]
      },
      "lineHeight": {
        "tight": "1.25",
        "snug": "1.35",
        "normal": "1.5",
        "relaxed": "1.65"
      },
      "letterSpacing": {
        "tight": "-0.01em",
        "normal": "0",
        "loose": "0.02em"
      },
      "transitionDuration": {
        "instant": "0ms",
        "fast": "120ms",
        "moderate": "200ms",
        "slow": "320ms"
      },
      "transitionTimingFunction": {
        "standard": "cubic-bezier(0.2, 0, 0.38, 0.9)",
        "emphasized": "cubic-bezier(0.2, 0, 0, 1)",
        "decelerate": "cubic-bezier(0, 0, 0.2, 1)",
        "accelerate": "cubic-bezier(0.4, 0, 1, 1)"
      },
      "zIndex": {
        "base": 0,
        "dropdown": 20,
        "sticky": 30,
        "modal": 999,
        "popover": 1000,
        "toast": 1100
      }
    }
  }
};
