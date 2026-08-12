// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IncrementalList } from '../IncrementalList';

/**
 * jsdom has no IntersectionObserver, which is the point of the button: the list has to remain
 * fully reachable when the observer is missing, disabled, or the reader is on a keyboard.
 */

afterEach(cleanup);

const items = Array.from({ length: 100 }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}` }));

function renderList(count: number, initial = 24, step = 24) {
  return render(
    <IncrementalList
      items={items.slice(0, count)}
      initial={initial}
      step={step}
      noun="items"
      keyFor={(item) => item.id}
      renderItem={(item) => <span>{item.label}</span>}
    />,
  );
}

describe('IncrementalList', () => {
  it('renders only the first slice', () => {
    renderList(100);
    expect(screen.getByText('Item 0')).toBeDefined();
    expect(screen.getByText('Item 23')).toBeDefined();
    expect(screen.queryByText('Item 24')).toBeNull();
  });

  it('says how much is not shown rather than truncating silently', () => {
    renderList(100);
    expect(screen.getByText('Showing 24 of 100 items.')).toBeDefined();
  });

  it('grows a step at a time without an observer', () => {
    renderList(100);
    fireEvent.click(screen.getByRole('button', { name: 'Show 24 more' }));
    expect(screen.getByText('Item 47')).toBeDefined();
    expect(screen.queryByText('Item 48')).toBeNull();
  });

  it('offers only what is left on the last step', () => {
    renderList(30);
    expect(screen.getByRole('button', { name: 'Show 6 more' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Show 6 more' }));
    expect(screen.getByText('Item 29')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });

  it('shows a short list whole, with no control at all', () => {
    renderList(5);
    expect(screen.getByText('Item 4')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it('starts from the top again when the list changes under it', () => {
    const { rerender } = renderList(100);
    fireEvent.click(screen.getByRole('button', { name: 'Show 24 more' }));
    expect(screen.getByText('Item 47')).toBeDefined();

    // A search narrowing the results must not keep the limit grown for the previous set.
    rerender(
      <IncrementalList
        items={items.slice(10, 70)}
        noun="items"
        keyFor={(item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
      />,
    );
    expect(screen.getByText('Showing 24 of 60 items.')).toBeDefined();
  });
});
