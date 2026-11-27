import Script from "next/script";

const GTM_ID = "GTM-5MKP7BZX";

const GTM_INLINE_SCRIPT = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`;

export function GtmNtHead() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
        strategy="beforeInteractive"
      />
      <Script id="gtm-nt" strategy="beforeInteractive">
        {GTM_INLINE_SCRIPT}
      </Script>
    </>
  );
}

export function GtmNtBody() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
