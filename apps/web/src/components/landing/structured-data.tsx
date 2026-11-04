import { FAQ } from "@/lib/landing/content";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// schema.org JSON-LD for the landing page: who publishes the site, what the product
// is, and the FAQ as questions and answers. Google, Bing, Yandex and AI answer
// engines read this to describe the site in results. Every value restates something
// the page itself says; nothing here is claimed only for search engines.
const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#org`,
      name: "Alarsio",
      url: siteUrl,
      logo: `${siteUrl}/icon`
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#site`,
      name: "Alarsio",
      url: siteUrl,
      inLanguage: "en-IN",
      publisher: { "@id": `${siteUrl}/#org` }
    },
    {
      "@type": "SoftwareApplication",
      name: "Alarsio",
      url: siteUrl,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Android, Web",
      description:
        "Offline-first site records for construction contractors in India: attendance, daily reports and materials captured on site with no signal, and wages built from approved attendance.",
      audience: { "@type": "BusinessAudience", audienceType: "Construction contractors running 2 to 20 sites" },
      areaServed: { "@type": "Country", name: "India" },
      publisher: { "@id": `${siteUrl}/#org` }
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a }
      }))
    }
  ]
};

// "<" escaped so no string in the data can close the script tag.
const json = JSON.stringify(graph).replace(/</g, "\\u003c");

export function StructuredData() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
