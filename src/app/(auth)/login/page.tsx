'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get('invite');
  const t = useTranslations('LoginPage');
  // Set by /auth/callback when an emailed link (confirmation, password
  // reset) could not be turned into a session — see src/lib/auth/callback.ts.
  const linkError = searchParams.get('error');
  const linkErrorMessage =
    linkError === 'link_expired'
      ? t('linkExpired')
      : linkError === 'link_invalid'
        ? t('linkInvalid')
        : null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Full-page navigation (not router.push) so the browser issues a
    // fresh top-level request that carries the just-written Supabase
    // auth cookies to the middleware gating /dashboard. A soft
    // client-side navigation can reach the protected route before the
    // server observes the new session, so the middleware bounces it
    // back to /login — which looks like the page "just refreshing"
    // instead of signing in (issue #365). Mirrors the deliberate full
    // reload the invite-accept flow already uses in join/[token].
    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : '/dashboard';
    window.location.href = destination;
  };

  return (
    <div className="flex w-full items-center justify-center">
      <Card className="w-full gap-7 overflow-visible rounded-none bg-transparent p-0 ring-0">
        <CardHeader className="gap-2 px-0 text-left">
          <CardTitle className="text-foreground text-2xl font-semibold tracking-tight">
            {inviteToken ? t('titleAccept') : t('titleWelcome')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken ? t('descAccept') : t('descWelcome')}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {linkErrorMessage && !error && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                {linkErrorMessage}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-muted-foreground">
                {t('emailLabel')}
              </Label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-border bg-card/40 text-foreground placeholder:text-muted-foreground focus-visible:border-primary h-12 rounded-xl pl-11 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-muted-foreground">
                {t('passwordLabel')}
              </Label>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-border bg-card/40 text-foreground placeholder:text-muted-foreground focus-visible:border-primary h-12 rounded-xl pr-12 pl-11 shadow-none focus-visible:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  aria-label={t(showPassword ? 'hidePassword' : 'showPassword')}
                  aria-pressed={showPassword}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-ring absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg focus-visible:outline-2"
                >
                  {showPassword ? (
                    <Eye aria-hidden="true" className="size-4" />
                  ) : (
                    <EyeOff aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
              {/* Below the input so Tab goes email -> password -> link. */}
              <Link
                href="/forgot-password"
                className="text-primary hover:text-primary/80 self-end text-sm"
              >
                {t('forgotPassword')}
              </Link>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 relative mt-3 h-12 w-full rounded-xl shadow-none disabled:opacity-50"
            >
              {loading ? t('signingIn') : t('signIn')}
              <ArrowRight
                aria-hidden="true"
                className="absolute right-4 size-4"
              />
            </Button>
          </form>

          <div className="text-muted-foreground my-6 flex items-center gap-4 text-xs">
            <span className="bg-border h-px flex-1" />
            {t('or')}
            <span className="bg-border h-px flex-1" />
          </div>
          <p className="text-muted-foreground text-center text-sm">
            {t('noAccount')}{' '}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : '/signup'
              }
              className="text-primary hover:text-primary/80"
            >
              {t('createAccount')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
