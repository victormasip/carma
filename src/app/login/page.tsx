'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import AuthPanel from '@/components/ui/AuthPanel'

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#0e0d0c]"><Loader2 className="animate-spin h-6 w-6 text-carma-400" /></main>}>
      <AuthPanel initialMode="login" />
    </Suspense>
  )
}
