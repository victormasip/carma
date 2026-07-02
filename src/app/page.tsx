import type { Metadata } from 'next'
import LandingPage from '@/components/marketing/LandingPage'

export const metadata: Metadata = {
  title: 'Carma — El blog que s’escriu per WhatsApp',
  description:
    'Envia una nota de veu per WhatsApp i publica un article SEO al teu blog. Carma clona la identitat de la teva web, hi posa un agent a dins i tu només aproves. Sense codi.',
}

export default function Home() {
  return <LandingPage />
}
