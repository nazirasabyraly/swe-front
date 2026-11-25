/** Emails "sent" by the mock backend, so verification/reset links are reachable in demo mode. */

export interface MockEmail {
  to: string;
  kind: 'verify-email' | 'reset-password';
  link: string;
}

const outbox: MockEmail[] = [];

export function sendMockEmail(email: MockEmail) {
  outbox.push(email);
  console.info(`[mock email] ${email.kind} → ${email.to}: ${email.link}`);
}

export function latestMockEmail(to: string, kind: MockEmail['kind']): MockEmail | undefined {
  const address = to.trim().toLowerCase();
  return [...outbox].reverse().find((e) => e.to === address && e.kind === kind);
}
