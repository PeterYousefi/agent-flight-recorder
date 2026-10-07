import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import './styles.css'
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000, retry: 1, refetchOnWindowFocus: true } },
})
const router = createRouter({ routeTree, context: { queryClient }, scrollRestoration: true })
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
const element = document.getElementById('root')
if (element === null) throw new Error('Application root is missing')
createRoot(element).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
