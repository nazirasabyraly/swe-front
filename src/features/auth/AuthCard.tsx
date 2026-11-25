import type { ReactNode } from 'react';

/** Centred card used by every sign-in / registration screen. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title" className="auth-card__title">
        {title}
      </h1>
      {subtitle && <p className="label-muted auth-card__subtitle">{subtitle}</p>}
      {children}
    </section>
  );
}
