import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n';
import { TooltipProvider } from "@/components/ui/tooltip";
import { Inter, Roboto, Poppins, Montserrat, DM_Sans } from "next/font/google";
import type { Metadata, Viewport } from 'next';
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-poppins", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-montserrat", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-dm-sans", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const baseUrl = 'https://openvid.dev';
  
  const languages: Record<string, string> = {};
  locales.forEach((loc) => {
    languages[loc] = `${baseUrl}/${loc}`;
  });

  const ogLocaleMap: Record<string, string> = {
    en: 'en_US',
    es: 'es_ES',
    ru: 'ru_RU',
    ko: 'ko_KR'
  };

  const currentOgLocale = ogLocaleMap[locale] || 'en_US';
  const alternateLocales = locales.filter(l => l !== locale).map(l => ogLocaleMap[l]);

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: "OpenVid | Create Cinematic Product Demos in Your Browser",
      template: "%s | OpenVid",
    },
    description: "Free, privacy-first, browser-based video editor. Turn standard screen recordings into professional product demos with 3D device mockups, cinematic zooms, and 4K export.",
    applicationName: "OpenVid",
    generator: "Next.js",
    category: "design tool",
    keywords: [
      "openvid", "product demo creator", "browser video editor", "screen recorder", 
      "3D device mockups", "cinematic video zooms", "local video rendering", 
      "privacy-first video tool", "ffmpeg.wasm editor", "SaaS marketing video", "Cristian Olivera"
    ],
    authors: [{ name: "Cristian Olivera", url: "https://github.com/CristianOlivera1" }],
    creator: "Cristian Olivera",
    publisher: "OpenVid",
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    icons: {
      icon: "/images/metadata/favicon.svg",
      shortcut: "/images/metadata/shortcut.svg",
      apple: "/images/metadata/apple.svg",
    },
    appleWebApp: {
      title: "OpenVid",
      statusBarStyle: "black-translucent",
      capable: true,
    },
    twitter: {
      card: "summary_large_image",
      creator: "@cristianolivera",
      site: "@openviddev",
    },
    other: {
      "msapplication-TileColor": "#000000",
      "format-detection": "telephone=no",
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages,
    },
    openGraph: {
      type: "website",
      siteName: "OpenVid",
      images: [
        {
          url: "/images/metadata/preview-openvid.jpg",
          width: 1200,
          height: 630,
          alt: "OpenVid - 3D Mockups and Cinematic Demo Creator",
          type: "image/jpeg",
        },
      ],
      locale: currentOgLocale,
      alternateLocale: alternateLocales,
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// 5. Layout Principal
export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={`
          ${inter.variable} ${roboto.variable} ${poppins.variable} 
          ${montserrat.variable} ${dmSans.variable} ${inter.className} 
          antialiased dark
        `}
      >
        <NextIntlClientProvider key={locale} messages={messages} locale={locale}>
          <TooltipProvider delayDuration={200}>
            {children}
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}