// Static replacement for the Instafeed app: pages the card row with the dots and opens posts on click.
class InstagramFeed {
  static DRAG_TOLERANCE_PIXELS = 8;

  constructor(section) {
    this.section = section;
    this.wrapper = section.querySelector('.instafeed-new-layout-wrapper');
    this.dots = Array.from(section.querySelectorAll('[data-abs-instagram-page]'));
    this.pointerStartX = 0;
    this.pointerStartY = 0;
    this.pointerMoved = false;
    this.scrollFrame = null;
  }

  start() {
    if (!this.wrapper) return;
    for (const dot of this.dots) {
      dot.addEventListener('click', () => this.scrollToPage(Number(dot.dataset.absInstagramPage || 0)));
    }
    this.wrapper.addEventListener('scroll', () => this.scheduleDotSync(), { passive: true });
    this.wrapper.addEventListener('pointerdown', (event) => this.rememberPointerStart(event), { passive: true });
    this.wrapper.addEventListener('pointermove', (event) => this.trackPointerMove(event), { passive: true });
    this.wrapper.addEventListener('click', (event) => this.openClickedPost(event));
    this.wrapper.addEventListener('keydown', (event) => this.openFocusedPost(event));
    this.syncDotsFromScroll();
  }

  maxScroll() {
    return Math.max(0, this.wrapper.scrollWidth - this.wrapper.clientWidth);
  }

  scrollToPage(index) {
    const lastIndex = Math.max(1, this.dots.length - 1);
    const pageIndex = Math.min(index, lastIndex);
    this.wrapper.scrollTo({ left: this.maxScroll() * (pageIndex / lastIndex), behavior: 'smooth' });
    this.setActiveDot(Math.min(index, this.dots.length - 1));
  }

  scheduleDotSync() {
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => this.syncDotsFromScroll());
  }

  syncDotsFromScroll() {
    const maxScroll = this.maxScroll();
    if (maxScroll <= 1) {
      this.setActiveDot(0);
      return;
    }
    const progress = Math.min(1, Math.max(0, this.wrapper.scrollLeft / maxScroll));
    this.setActiveDot(Math.round(progress * (this.dots.length - 1)));
  }

  setActiveDot(activeIndex) {
    for (let dotIndex = 0; dotIndex < this.dots.length; dotIndex += 1) {
      const dot = this.dots[dotIndex];
      const isActive = dotIndex === activeIndex;
      dot.classList.toggle('is-active', isActive);
      if (isActive) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    }
  }

  rememberPointerStart(event) {
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.pointerMoved = false;
  }

  trackPointerMove(event) {
    const movedX = Math.abs(event.clientX - this.pointerStartX);
    const movedY = Math.abs(event.clientY - this.pointerStartY);
    if (movedX > InstagramFeed.DRAG_TOLERANCE_PIXELS || movedY > InstagramFeed.DRAG_TOLERANCE_PIXELS) {
      this.pointerMoved = true;
    }
  }

  openClickedPost(event) {
    if (this.pointerMoved) return;
    this.openPostFor(event.target);
  }

  openFocusedPost(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openPostFor(event.target);
  }

  openPostFor(target) {
    const card = target.closest('.instafeed-new-layout-item');
    if (!card || !card.dataset.absInstagramPermalink) return;
    window.open(card.dataset.absInstagramPermalink, '_blank', 'noopener,noreferrer');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  for (const section of document.querySelectorAll('.abs-instagram')) {
    new InstagramFeed(section).start();
  }
});
