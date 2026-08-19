import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /growth projector/i })).toBeInTheDocument();
  });

  it('renders the amount input with its default value', () => {
    render(<App />);
    const input = screen.getByLabelText(/initial amount/i);
    expect(input).toHaveValue(10000);
  });

  it('updates the input value when changed', () => {
    render(<App />);
    const input = screen.getByLabelText(/initial amount/i);
    fireEvent.change(input, { target: { value: '50000' } });
    expect(input).toHaveValue(50000);
  });

  it('clamps negative input to zero', () => {
    render(<App />);
    const input = screen.getByLabelText(/initial amount/i);
    fireEvent.change(input, { target: { value: '-500' } });
    expect(input).toHaveValue(0);
  });
});
