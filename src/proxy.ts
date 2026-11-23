import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAccountRole } from '@/lib/auth/roles'
import { canAccessSettingsSection, canAccessWorkspacePage, canAccessWorkspaceApi, isWorkspaceApi } from '@/lib/auth/workspace-access'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated
  // Every top-level route under src/app/(dashboard)/ belongs here —
  // middleware.test.ts reads that directory and fails on a missing one.
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/tags', '/pipelines', '/broadcasts', '/campaigns', '/automations', '/flows', '/agents', '/notifications', '/settings', '/organization']
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // API routes that need auth (not webhooks)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  const pathname = request.nextUrl.pathname
  if (user && (protectedPaths.some(path => pathname === path || pathname.startsWith(`${path}/`)) || isWorkspaceApi(pathname))) {
    const { data: profile } = await supabase.from('profiles').select('account_role').eq('user_id', user.id).maybeSingle()
    const role = profile?.account_role
    if (!isAccountRole(role)) {
      return withRefreshedCookies(NextResponse.json({ error: 'Sem acesso à empresa.' }, { status: 403 }))
    }
    if (isWorkspaceApi(pathname) && !canAccessWorkspaceApi(role, pathname, request.method)) {
      return withRefreshedCookies(NextResponse.json({ error: 'Seu perfil não permite esta operação.' }, { status: 403 }))
    }
    if (!pathname.startsWith('/api/') && (!canAccessWorkspacePage(role, pathname) ||
      (pathname === '/settings' && !canAccessSettingsSection(role, request.nextUrl.searchParams.get('tab') || 'overview')))) {
      const url = request.nextUrl.clone()
      url.pathname = pathname === '/settings' ? '/settings' : '/inbox'
      url.search = pathname === '/settings' ? '?tab=profile' : ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
    if (pathname === '/settings' && request.nextUrl.searchParams.get('tab') === 'members') {
      const url = request.nextUrl.clone()
      url.pathname = '/organization'
      url.search = '?view=users'
      return withRefreshedCookies(NextResponse.redirect(url))
    }
    if (pathname === '/settings' && request.nextUrl.searchParams.get('tab') === 'templates') {
      const url = request.nextUrl.clone()
      url.pathname = '/campaigns/templates'
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
