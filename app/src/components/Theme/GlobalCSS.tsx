import { css, Global, useTheme } from "@emotion/react"

export const GlobalCSS = () => {
  const theme = useTheme()
  return (
    <Global
      styles={css`
        :root {
          --font-sans: ${theme.font};
          --font-mono: ${theme.monoFont};
          --color-theme: ${theme.themeColor};
          --color-on-surface: ${theme.onSurfaceColor};
          --color-background: ${theme.backgroundColor};
          --color-background-secondary: ${theme.secondaryBackgroundColor};
          --color-background-dark: ${theme.darkBackgroundColor};
          --color-editor-background: ${theme.editorBackgroundColor};
          --color-editor-grid: ${theme.editorGridColor};
          --color-editor-grid-secondary: ${theme.editorSecondaryGridColor};
          --color-divider: ${theme.dividerColor};
          --color-popup-border: ${theme.popupBorderColor};
          --color-text: ${theme.textColor};
          --color-text-secondary: ${theme.secondaryTextColor};
          --color-text-tertiary: ${theme.tertiaryTextColor};
          --color-record: ${theme.recordColor};
          --color-shadow: ${theme.shadowColor};
          --color-highlight: ${theme.highlightColor};
          --color-green: ${theme.greenColor};
          --color-red: ${theme.redColor};
          --color-yellow: ${theme.yellowColor};
          --color-step: ${theme.stepColor};
          --color-step-rest: ${theme.stepRestColor};
          --color-step-skip: ${theme.stepSkipColor};
          --color-scrollbar: ${theme.scrollbarColor};
          --color-scrollbar-hover: ${theme.scrollbarHoverColor};
        }

        /* macOS-style overlay scrollbars: no track, a translucent thumb that
           darkens on hover. Firefox gets the same look via scrollbar-color. */
        * {
          scrollbar-width: thin;
          scrollbar-color: var(--color-scrollbar) transparent;
        }

        *::-webkit-scrollbar {
          width: 0.75rem;
          height: 0.75rem;
        }

        *::-webkit-scrollbar-track,
        *::-webkit-scrollbar-corner {
          background: transparent;
        }

        *::-webkit-scrollbar-button {
          display: none;
        }

        *::-webkit-scrollbar-thumb {
          min-height: 2rem;
          border: 0.25rem solid transparent;
          border-radius: 999px;
          background-color: var(--color-scrollbar);
          background-clip: content-box;
        }

        *::-webkit-scrollbar-thumb:hover {
          background-color: var(--color-scrollbar-hover);
        }

        html {
          font-size: 16px;
        }

        html,
        body,
        #root {
          height: 100%;
          margin: 0;
          padding: 0;
        }

        body {
          -webkit-font-smoothing: subpixel-antialiased;
          color: var(--color-text);
          background-color: var(--color-background);
          overscroll-behavior: none;
          font-family: var(--font-sans);
          overflow: hidden;
        }
      `}
    />
  )
}
