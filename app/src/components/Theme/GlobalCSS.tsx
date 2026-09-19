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
