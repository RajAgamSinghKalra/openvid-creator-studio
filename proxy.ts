import { type NextRequest } from "next/server";
import createIntlMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';
import { updateSession } from "@/utils/supabase/middleware";
import { LOCAL_ONLY_DEFAULT, isLocalHostname } from "@/lib/local-mode";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true
});

export default async function proxy(request: NextRequest) {
  const country = request.headers.get('x-vercel-ip-country') || 'UNKNOWN';

  const intlResponse = intlMiddleware(request);
  intlResponse.headers.set('x-user-country', country);

  const localOnly = LOCAL_ONLY_DEFAULT || isLocalHostname(request.nextUrl.hostname);
  if (!localOnly) {
    const supabaseResponse = await updateSession(request);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      intlResponse.cookies.set(cookie.name, cookie.value);
    });
  }

  intlResponse.headers.set('x-openvid-storage', localOnly ? 'local-only' : 'hosted');

  return intlResponse;
}

export const config = {
  matcher: [
    '/((?!api|ffmpeg|models|hdri|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|avif|webm|wasm|js|glb|gltf|json)$).*)'
  ],
};
