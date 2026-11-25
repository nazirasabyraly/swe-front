export const MIN_PASSWORD_LENGTH = 8;

// Deliberately loose: the server is the authority, this only catches typos early.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthFieldError =
  | 'auth.errors.emailRequired'
  | 'auth.errors.emailInvalid'
  | 'auth.errors.passwordRequired'
  | 'auth.errors.passwordTooShort'
  | 'auth.errors.passwordMismatch'
  | 'auth.errors.nameRequired';

export function emailError(email: string): AuthFieldError | undefined {
  if (!email.trim()) return 'auth.errors.emailRequired';
  if (!EMAIL.test(email.trim())) return 'auth.errors.emailInvalid';
  return undefined;
}

export function newPasswordError(password: string): AuthFieldError | undefined {
  if (!password) return 'auth.errors.passwordRequired';
  if (password.length < MIN_PASSWORD_LENGTH) return 'auth.errors.passwordTooShort';
  return undefined;
}

export function confirmError(password: string, confirm: string): AuthFieldError | undefined {
  return confirm !== password ? 'auth.errors.passwordMismatch' : undefined;
}

/** Drops undefined entries; an empty result means the form is valid. */
export function compact<T extends Record<string, string | undefined>>(errors: T): Partial<T> {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as Partial<T>;
}

/** Focuses the first field (in DOM order) whose id is in `ids`. */
export function focusFirst(form: HTMLFormElement | null, ids: string[]) {
  const first = Array.from(form?.querySelectorAll<HTMLElement>('input, select, textarea') ?? []).find((el) =>
    ids.includes(el.id),
  );
  first?.focus();
}
