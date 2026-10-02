import type { Plugin } from "vite"

// Google Tag Manager on the built page, as its install instructions put it:
// the loader as high in the head as it goes, and the frame standing in for
// it where scripts don't run straight after the body opens. Only a build
// gets it, so developing and testing aren't counted. The docs load the same
// container (see site/lib/config.ts).

const loader = (id: string) =>
  `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`

const fallback = (id: string) =>
  `<iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`

export const tagManager = (id: string): Plugin => ({
  name: "tag-manager",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "script", children: loader(id), injectTo: "head-prepend" },
    { tag: "noscript", children: fallback(id), injectTo: "body-prepend" },
  ],
})
