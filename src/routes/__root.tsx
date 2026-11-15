import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '@/styles.css?url'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'UTF-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'theme-color', content: '#203345' },
      { title: 'Sortarr · Your next short watch' }
    ],
    links: [{ rel: 'stylesheet', href: styles }]
  }),
  component: RootComponent,
  shellComponent: RootDocument
})

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
