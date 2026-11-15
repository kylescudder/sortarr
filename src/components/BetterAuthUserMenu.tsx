import { UserRound } from 'lucide-react'
import { UserButton } from '@/components/auth/user/user-button'
import { BetterAuthUIProvider } from '@/components/BetterAuthUIProvider'

// Lazy-loaded so the reel's first paint doesn't wait for the auth UI bundle.
export function BetterAuthUserMenu() {
  return (
    <BetterAuthUIProvider>
      <UserButton
        size='icon'
        align='end'
        hideSettings
        className='ring-deep/30 hover:ring-deep/60 ring-2'
        links={[
          {
            label: 'Profile',
            href: '/profile',
            icon: <UserRound />,
            visibility: 'authenticated'
          }
        ]}
      />
    </BetterAuthUIProvider>
  )
}
