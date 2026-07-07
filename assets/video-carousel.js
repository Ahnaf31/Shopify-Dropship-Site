class VideoCarousel extends HTMLElement {
  static selector = "[data-video-carousel]";

  connectedCallback() {
    this.track = this.querySelector("[data-carousel-track]");
    this.nextBtn = this.querySelector("[data-carousel-next]");
    this.nextBtn?.addEventListener("click", () => this.scrollNext());
    this.updateArrowVisibility();
    this.track?.addEventListener("scroll", () => this.updateArrowVisibility(), {
      passive: true,
    });
    window.addEventListener("resize", () => this.updateArrowVisibility());
  }

  scrollNext() {
    const itemWidth =
      this.track.children[0]?.getBoundingClientRect().width || 0;
    const gap = parseFloat(getComputedStyle(this.track).gap) || 0;
    this.track.scrollBy({ left: itemWidth + gap, behavior: "smooth" });
  }

  updateArrowVisibility() {
    if (!this.nextBtn) return;
    const maxScroll = this.track.scrollWidth - this.track.clientWidth;
    this.nextBtn.classList.toggle("is-hidden", maxScroll <= 4);
  }
}

document.querySelectorAll(VideoCarousel.selector).forEach((el) => {
  if (!(el instanceof VideoCarousel))
    Object.setPrototypeOf(el, VideoCarousel.prototype);
});
customElements.define("video-carousel", VideoCarousel);
