import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast } from '@/components/toast';

describe('Toast', () => {
  const mockDismiss = vi.fn();

  it('renders success toast', () => {
    const { container } = render(<Toast message="Success!" type="success" onDismiss={mockDismiss} />);
    
    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders error toast', () => {
    const { container } = render(<Toast message="Error!" type="error" onDismiss={mockDismiss} />);
    
    expect(screen.getByText('Error!')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls onDismiss when close button is clicked', () => {
    render(<Toast message="Test" type="success" onDismiss={mockDismiss} />);
    
    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);
    
    expect(mockDismiss).toHaveBeenCalled();
  });
});
