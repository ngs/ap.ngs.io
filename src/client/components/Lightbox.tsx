import { useEffect, useRef } from 'hono/jsx/dom';

export function Lightbox() {
  const lightboxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const link = target.closest('[data-lightbox]') as HTMLAnchorElement;
      if (link && imgRef.current && lightboxRef.current) {
        e.preventDefault();
        imgRef.current.src = link.href;
        lightboxRef.current.classList.add('is-open');
      }
    };

    const closeLightbox = () => {
      if (lightboxRef.current && imgRef.current) {
        lightboxRef.current.classList.remove('is-open');
        imgRef.current.src = '';
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  const handleClose = () => {
    if (lightboxRef.current && imgRef.current) {
      lightboxRef.current.classList.remove('is-open');
      imgRef.current.src = '';
    }
  };

  return (
    <div id="lightbox" class="lightbox" ref={lightboxRef} onClick={handleClose}>
      <span class="lightbox-close">&times;</span>
      <img id="lightbox-img" src="" alt="" ref={imgRef} />
    </div>
  );
}
