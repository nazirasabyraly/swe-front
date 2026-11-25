import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from './DataStates';
import { DateTimeText } from './DateTimeText';
import { Money } from './Money';
import { StatusBadge } from './StatusBadge';

describe('Money', () => {
  it('formats server amounts as KZT', () => {
    render(<Money amount={18500} />);
    expect(screen.getByText('₸18,500')).toBeInTheDocument();
  });

  it('can show zero as Free', () => {
    render(<Money amount={0} freeWhenZero />);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });
});

describe('DateTimeText', () => {
  it('renders in the event time zone with a zone label and a machine-readable value', () => {
    const value = new Date('2026-10-12T14:00:00Z');
    render(<DateTimeText value={value} timeZone="Asia/Almaty" showZone />);
    const time = screen.getByText('Mon, 12 Oct 2026, 19:00 (GMT+5)');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-10-12T14:00:00.000Z');
  });
});

describe('StatusBadge', () => {
  it('pairs the colour with a text label and a hidden symbol', () => {
    render(<StatusBadge tone="danger">Refunded</StatusBadge>);
    const badge = screen.getByText('Refunded');
    expect(badge).toHaveClass('status-badge--danger');
    expect(badge).toHaveTextContent('✕Refunded');
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveTextContent('✕');
  });
});

describe('data states', () => {
  it('announces loading', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('shows an error with retry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Couldn’t load orders" message="Server unavailable" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load ordersServer unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows an empty state with an action', () => {
    render(<EmptyState title="No orders yet" description="Orders appear here." action={<a href="/x">Browse</a>} />);
    expect(screen.getByRole('heading', { name: 'No orders yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Refund</button>
        <ConfirmDialog
          open={open}
          title="Refund this order?"
          confirmLabel="Refund ₸20,700"
          tone="danger"
          onConfirm={async () => {
            await onConfirm();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        >
          The tickets will be cancelled.
        </ConfirmDialog>
      </>
    );
  }

  it('opens as a labelled dialog with Cancel focused for destructive actions', async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={async () => {}} />);

    await user.click(screen.getByRole('button', { name: 'Refund' }));

    const dialog = screen.getByRole('dialog', { name: 'Refund this order?' });
    expect(dialog).toHaveAccessibleDescription('The tickets will be cancelled.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs the action and shows its error without closing', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('Refund window has closed.'));
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Refund' }));
    await user.click(screen.getByRole('button', { name: 'Refund ₸20,700' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refund window has closed.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refund ₸20,700' }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
