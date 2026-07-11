import Hero from "@/app/components/ui/home/Hero";
import InteractiveRecordingSteps from "@/app/components/ui/home/RecordingSteps";
import { StructuredData, generateWebAppSchema, generateOrganizationSchema } from "@/app/components/seo/StructuredData";
import type { Metadata } from 'next';
import DonationCard from "@/app/components/ui/home/DonationCard";
import VideoHero from "@/app/components/ui/home/VideoHero";
import BannerCTA from "@/app/components/ui/home/BannerCTA";
import FeaturesGrid from "@/app/components/ui/home/Featuresgrid";
import FeaturesShowcase from "@/app/components/ui/home/FeaturesShowcase";
import SocialReactions from "@/app/components/ui/home/SocialReactions";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const baseUrl = 'https://openvid.dev';

  const metadata = {
    es: {
      title: 'Crea demos profesionales y edita videos en segundos',
      description: 'Editor de video online gratuito con IA. Graba pantalla, añade zooms cinemáticos, mockups profesionales y exporta en HD. Sin marca de agua.',
      keywords: ['editor de video', 'grabar pantalla', 'demos profesionales', 'zoom video', 'mockups', 'screen recorder', 'video editor online'],
    },
    en: {
      title: 'Create Professional Demos and Edit Videos in Seconds',
      description: 'Free AI-powered online video editor. Screen recorder, cinematic zooms, professional mockups, and HD export. No watermark.',
      keywords: ['video editor', 'screen recorder', 'professional demos', 'video zoom', 'mockups', 'online video editor', 'free video editor'],
    },
    ru: {
      title: 'Создавайте профессиональные демонстрации и редактируйте видео за секунды',
      description: 'Бесплатный онлайн-редактор видео с ИИ. Запись экрана, кинематические зумы, профессиональные макеты и экспорт в HD. Без водяного знака.',
      keywords: ['редактор видео', 'запись экрана', 'профессиональные демонстрации', 'зум видео', 'макеты', 'онлайн-редактор видео', 'бесплатный редактор видео'],
    },
    ko: {
      title: '몇 초 만에 전문적인 데모를 만들고 동영상을 편집하세요',
      description: '무료 AI 기반 온라인 동영상 에디터. 화면을 녹화하고 시네마틱 줌, 전문 목업을 추가해 HD로 내보내세요. 워터마크 없음.',
      keywords: ['동영상 에디터', '화면 녹화', '전문 데모', '동영상 줌', '목업', '온라인 동영상 에디터', '무료 동영상 에디터'],
    },
  };

  const { title, description, keywords } = metadata[locale as 'es' | 'en' | 'ru' | 'ko'] || metadata.es;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        es: `${baseUrl}/es`,
        en: `${baseUrl}/en`,
        ru: `${baseUrl}/ru`,
        ko: `${baseUrl}/ko`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}`,
      images: [
        {
          url: `${baseUrl}/images/metadata/preview-openvid.jpg`,
          width: 1200,
          height: 630,
          alt: 'openvid - Professional Video Editor',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${baseUrl}/images/metadata/preview-openvid.jpg`],
    },
  };
}

export default async function Home({ params }: Props) {
  const { locale } = await params;

  return (
    <>
      <StructuredData data={generateWebAppSchema(locale as 'en' | 'es' | 'ru' | 'ko')} />
      <StructuredData data={generateOrganizationSchema()} />

      <div className="flex flex-col">
        <div className="relative overflow-hidden bg-gradient-radial-primary w-full">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-75 h-75 rounded-full bg-cyan-500/15 blur-[80px] pointer-events-none z-0" aria-hidden="true" />
          <section className="pt-32 pb-6 sm:pb-14" aria-label="Hero section">
            <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
              <Hero />
            </div>
            <VideoHero />
          </section>
          <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-[#0a0a0a] to-transparent pointer-events-none z-20" />
        </div>

        <section className="w-full py-10 sm:py-16" aria-label="How it works">
          <div className="max-w-7xl mx-auto xl:px-0">
            <InteractiveRecordingSteps />
          </div>
        </section>

        <div className="relative overflow-hidden w-full bg-black">
          <section className="w-full" aria-label="Editor features and demos">
            <div className="w-full mx-auto">
              <FeaturesShowcase />
              <FeaturesGrid />
            </div>

            <div id="reactions" className="w-full">
              <SocialReactions />
            </div>

            <div className="max-w-xl mx-auto px-6 pt-24 pb-50">
              <DonationCard />
            </div>

            <BannerCTA />
          </section>
        </div>
      </div>
    </>
  );
}