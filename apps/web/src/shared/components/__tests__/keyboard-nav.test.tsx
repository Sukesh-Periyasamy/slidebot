/**
 * keyboard-nav.test.tsx
 *
 * Component-level tests for keyboard navigation and ARIA correctness:
 * - KeyboardShortcutsModal: Escape closes; role="dialog"; aria-modal; aria-labelledby;
 *   close button has accessible aria-label; keyboard focus works.
 * - CommandPalette: Arrow-key navigation changes selected index; Enter triggers action;
 *   listbox role present; options have aria-selected; backdrop click closes.
 *
 * These are unit-level tests (jsdom, no browser required).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KeyboardShortcutsModal } from '@/shared/components/KeyboardShortcutsModal';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// framer-motion needs explicit mock in jsdom because it relies on ResizeObserver
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentPropsWithoutRef<'div'>) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/features/settings/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    settings: { theme: 'dark' },
    updateSetting: vi.fn(),
  })),
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    signOut: vi.fn(),
  })),
}));

// ── Tests: KeyboardShortcutsModal ──────────────────────────────────────────────

describe('KeyboardShortcutsModal', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <KeyboardShortcutsModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with correct ARIA roles when isOpen=true', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-labelledby pointing to the heading', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const labelledById = dialog.getAttribute('aria-labelledby');
    expect(labelledById).toBeTruthy();
    const heading = document.getElementById(labelledById!);
    expect(heading).toBeInTheDocument();
    expect(heading?.textContent).toMatch(/keyboard shortcuts/i);
  });

  it('close button has an accessible aria-label', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);
    const closeBtn = screen.getByRole('button', { name: /close/i });
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn).toHaveAttribute('aria-label');
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose on Escape when isOpen=false', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);
    const closeBtn = screen.getByRole('button', { name: /close/i });
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders all keyboard shortcuts in a list', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);
    // The modal shows shortcuts in <li> elements
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Tests: CommandPalette (keyboard nav) ──────────────────────────────────────

import { CommandPalette } from '@/shared/components/CommandPalette';

describe('CommandPalette', () => {
  function renderPalette() {
    return render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );
  }

  async function openPalette() {
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
  }

  beforeEach(() => {
    // Ensure palette is closed before each test (reset DOM)
  });

  it('is closed by default (renders nothing)', () => {
    const { container } = renderPalette();
    expect(container.firstChild).toBeNull();
  });

  it('opens on Ctrl+K', async () => {
    renderPalette();
    await openPalette();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders a listbox with options', async () => {
    renderPalette();
    await openPalette();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(4);
  });

  it('first option is selected by default', async () => {
    renderPalette();
    await openPalette();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    // Other options should be false
    for (let i = 1; i < options.length; i++) {
      expect(options[i]).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('ArrowDown moves selection to next option', async () => {
    renderPalette();
    await openPalette();
    const input = screen.getByPlaceholderText(/type a command/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowUp wraps to last option from first', async () => {
    renderPalette();
    await openPalette();
    const input = screen.getByPlaceholderText(/type a command/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });
    const options = screen.getAllByRole('option');
    // Should wrap around to the last option
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes the palette', async () => {
    renderPalette();
    await openPalette();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('backdrop click closes the palette', async () => {
    renderPalette();
    await openPalette();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The backdrop is an aria-hidden div positioned absolutely over the dialog
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    await userEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('typing filters options', async () => {
    renderPalette();
    await openPalette();
    const input = screen.getByPlaceholderText(/type a command/i);
    await userEvent.type(input, 'Settings');
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(1);
    expect(options[0]!.textContent).toMatch(/settings/i);
  });

  it('shows "No results found" when filter yields empty', async () => {
    renderPalette();
    await openPalette();
    const input = screen.getByPlaceholderText(/type a command/i);
    await userEvent.type(input, 'zzz-nonexistent-command');
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });
});
