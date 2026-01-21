import { render } from 'hono/jsx/dom';
import { Lightbox } from './components/Lightbox';
import { formatDates } from './utils/formatDate';

document.addEventListener('DOMContentLoaded', () => {
  // Mount lightbox
  const lightboxContainer = document.getElementById('lightbox-container');
  if (lightboxContainer) {
    render(<Lightbox />, lightboxContainer);
  }

  // Format dates in user's timezone
  formatDates();
});
