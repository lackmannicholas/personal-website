import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders From the firehose', () => {
  render(<App />);
  const linkElement = screen.getByText(/From the firehose/i);
  expect(linkElement).toBeInTheDocument();
});
