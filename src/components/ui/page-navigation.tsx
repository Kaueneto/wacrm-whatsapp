import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageNavigationProps {
  backHref: string;
  backLabel: string;
  backDisabled?: boolean;
  items: { label: string; href?: string }[];
}

export function PageNavigation({
  backHref,
  backLabel,
  backDisabled = false,
  items,
}: PageNavigationProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={backDisabled}
        render={<Link href={backHref} />}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Button>
      <nav aria-label="Caminho de navegação" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {items.map((item, index) => (
            <Fragment key={`${index}-${item.href ?? 'current'}`}>
              {index > 0 && (
                <li aria-hidden="true" className="text-muted-foreground">
                  /
                </li>
              )}
              <li className="min-w-0 [overflow-wrap:anywhere] break-words">
                {item.href && index < items.length - 1 ? (
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium">
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
    </div>
  );
}
