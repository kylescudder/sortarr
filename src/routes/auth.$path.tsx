import { createFileRoute, Navigate } from '@tanstack/react-router'
import { Auth } from '@/components/auth/auth'
import { BetterAuthUIProvider } from '@/components/BetterAuthUIProvider'

export const Route = createFileRoute('/auth/$path')({ component: AuthPage })

function AuthPage() {
  const { path } = Route.useParams()
  // Accounts are never self-registered; allowlisted members start with an
  // email code or magic link.
  if (path === 'sign-up')
    return <Navigate to='/auth/$path' params={{ path: 'sign-in' }} replace />
  return (
    <div className='min-h-screen px-4 py-8 sm:px-8'>
      <main className='mx-auto flex w-full max-w-sm flex-col gap-6 sm:mt-10'>
        <header className='bg-deep rounded-xl px-4'>
          <div className='bulbs' aria-hidden='true' />
          <div className='letterboard text-deep rounded-sm px-5 py-4'>
            <p className='font-display text-sm font-extrabold tracking-[0.14em]'>
              SCUDDER PICTURE HOUSE
            </p>
            <p className='font-display text-4xl leading-none font-black tracking-[0.04em]'>
              SORTARR
            </p>
          </div>
          <div className='bulbs' aria-hidden='true' />
        </header>
        <BetterAuthUIProvider>
          <Auth path={path} className='w-full text-left' />
        </BetterAuthUIProvider>
      </main>
    </div>
  )
}
