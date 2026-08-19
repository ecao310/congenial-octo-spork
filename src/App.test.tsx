import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /marginal tax rate/i })).toBeInTheDocument();
  });

  it('renders the benefit input with its default value', () => {
    render(<App />);
    const input = screen.getByLabelText(/social security benefit/i);
    expect(input).toHaveValue(24000);
  });

  it('updates the input value when changed', () => {
    render(<App />);
    const input = screen.getByLabelText(/social security benefit/i);
    fireEvent.change(input, { target: { value: '36000' } });
    expect(input).toHaveValue(36000);
  });

  it('clamps negative input to zero', () => {
    render(<App />);
    const input = screen.getByLabelText(/social security benefit/i);
    fireEvent.change(input, { target: { value: '-500' } });
    expect(input).toHaveValue(0);
  });
});
