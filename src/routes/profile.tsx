import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '@better-auth-ui/react'
import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { ChangePassword } from '@/components/auth/settings/security/change-password'
import { UserProfile } from '@/components/auth/settings/account/user-profile'
import { Passkeys } from '@/components/auth/passkey/passkeys'
import { clearPendingSignIn } from '@/lib/pending-sign-in'
import { BetterAuthUIProvider } from '@/components/BetterAuthUIProvider'

export const Route = createFileRoute('/profile')({ component: ProfilePage })

function ProfilePage() {
  return (
    <div className='min-h-screen px-4 py-8 sm:px-8'>
      <main className='mx-auto w-full max-w-3xl'>
        <Link
          to='/'
          className='text-muted-foreground hover:text-foreground underline underline-offset-4'
        >
          Back to the reel
        </Link>
        <h1 className='font-display text-lamp mt-6 mb-8 text-4xl font-black tracking-[0.03em]'>
          Your profile
        </h1>
        <BetterAuthUIProvider redirectTo='/profile'>
          <BetterAuthProfile />
        </BetterAuthUIProvider>
      </main>
    </div>
  )
}

function BetterAuthProfile() {
  // Better Auth UI's session query, not the client's nanostore: sign-in awaits
  // this query before navigating here, while the nanostore can still hold the
  // signed-out value from a "Sign in again" round trip and bounce to sign-in.
  const { data: session, isPending } = useSession(authClient)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    if (session) clearPendingSignIn()
    else if (!isPending)
      void navigate({
        href: '/auth/sign-in?redirectTo=%2Fprofile',
        replace: true
      })
  }, [isPending, navigate, session])
  if (!session)
    return (
      <p role='status' className='text-muted-foreground'>
        Checking sign-in…
      </p>
    )
  async function signOut() {
    setSigningOut(true)
    setError('')
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setError('Unable to sign out. Please try again.')
        return
      }
      queryClient.clear()
      await navigate({ to: '/' })
    } catch {
      setError('Unable to sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }
  return (
    <>
      <UserProfile key={session.user.id} />
      <div className='mt-8'>
        <ChangePassword />
      </div>
      <Passkeys className='mt-8' />
      <p className='text-muted-foreground mt-4 text-sm'>
        Email codes remain available for recovery.
      </p>
      {error && (
        <p role='alert' className='text-destructive mt-6'>
          {error}
        </p>
      )}
      <button
        type='button'
        disabled={signingOut}
        onClick={() => void signOut()}
        className='border-input hover:bg-accent mt-8 rounded-full border px-5 py-3 disabled:opacity-60'
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </>
  )
}
