'use client'

import { Suspense } from 'react'
import AuthPanel from '@/components/ui/AuthPanel'
import KnotLoader from '@/components/ui/KnotLoader'

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-bg"><KnotLoader /></main>}>
      <AuthPanel initialMode="register" />
    </Suspense>
  )
}
