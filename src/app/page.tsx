import type { Metadata } from 'next'
import LandingPage from '@/components/marketing/LandingPage'

export const metadata: Metadata = {
  title: 'Carma — El blog que estima la teva marca',
  description:
    'Enganxa una URL. Carma clona la identitat visual del teu lloc web i et lliura un blog amb editor d’estil Notion en 30 segons. Sense codi.',
}

export default function Home() {
  return <LandingPage />
}
