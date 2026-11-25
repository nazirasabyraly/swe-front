import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '.';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { CreateEventForm } from '../features/create-event/CreateEventForm';
import { emptyEventDraft } from '../features/create-event/types';
import { now } from '../features/create-event/testUtils';
import { formatDateTime, formatKZT } from '../lib/format';

afterEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

describe('language switching', () => {
  it('translates the UI, sets <html lang> and remembers the choice', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LanguageSwitcher />
        <CreateEventForm initialDraft={emptyEventDraft} onContinue={() => {}} now={now} />
      </>,
    );
    expect(screen.getByLabelText('Event title')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Language'), 'Қазақша');

    expect(screen.getByLabelText('Іс-шара атауы')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Музыка' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('kk');
    expect(localStorage.getItem('biletflow.language')).toBe('kk');
  });

  it('uses Russian plural forms', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('ru');
    render(<CreateEventForm initialDraft={emptyEventDraft} onContinue={() => {}} now={now} />);

    await user.click(screen.getByRole('button', { name: 'Перейти к предпросмотру' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Исправьте 12 полей, чтобы продолжить');
    expect(screen.getByText('Введите название мероприятия.')).toBeInTheDocument();
    expect(i18n.t('eventPage.spots', { count: 21, formatted: '21' })).toBe('21 место');
    expect(i18n.t('eventPage.spots', { count: 3, formatted: '3' })).toBe('3 места');
  });
});

describe('formatting', () => {
  it.each([
    ['ru-RU', /^6\s500\s₸$/],
    ['kk-KZ', /^6\s500\s₸$/],
    ['en-GB', /^₸6,500$/],
  ])('formats KZT for %s', (locale, expected) => {
    expect(formatKZT(6500, locale)).toMatch(expected);
  });

  it('shows tiyn only when present', () => {
    expect(formatKZT(99.5, 'en-GB')).toBe('₸99.50');
  });

  it('formats in the event time zone, not the browser zone', () => {
    const start = new Date('2026-10-12T14:00:00Z');
    expect(formatDateTime(start, 'en-GB', 'Asia/Almaty')).toBe('Mon, 12 Oct 2026, 19:00');
    expect(formatDateTime(start, 'en-GB', 'Europe/London')).toBe('Mon, 12 Oct 2026, 15:00');
  });
});
