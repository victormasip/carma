import AuthRoute, { type AuthSearchParams } from '@/components/ui/AuthRoute'

// The session check happens on the SERVER (see AuthRoute): a signed-in visitor
// is redirected before a form exists, and everyone else gets the form in the
// first response — no loader, no round trip, no Supabase SDK in the bundle.

export default function LoginPage({ searchParams }: { searchParams: AuthSearchParams }) {
  return <AuthRoute mode="login" searchParams={searchParams} />
}
