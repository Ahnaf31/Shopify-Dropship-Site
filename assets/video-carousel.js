class VideoCarousel extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector("[data-carousel-track]");
    this.nextBtn = this.querySelector("[data-carousel-next]");
    this.prevBtn = this.querySelector("[data-carousel-prev]");
    this.dotsContainer = this.querySelector("[data-carousel-dots]");

    this.nextBtn?.addEventListener("click", () => this.scrollByOne(1));
    this.prevBtn?.addEventListener("click", () => this.scrollByOne(-1));

    this.buildDots();
    this.updateArrowVisibility();
    this.updateActiveDot();

    this.track?.addEventListener(
      "scroll",
      () => {
        this.updateArrowVisibility();
        this.updateActiveDot();
      },
      { passive: true },
    );
    window.addEventListener("resize", () => this.updateArrowVisibility());
  }

  scrollByOne(direction) {
    const itemWidth =
      this.track.children[0]?.getBoundingClientRect().width || 0;
    const gap = parseFloat(getComputedStyle(this.track).gap) || 0;
    this.track.scrollBy({
      left: (itemWidth + gap) * direction,
      behavior: "smooth",
    });
  }

  updateArrowVisibility() {
    const scrollLeft = this.track.scrollLeft;
    const maxScroll = this.track.scrollWidth - this.track.clientWidth;

    this.prevBtn?.classList.toggle("is-hidden", scrollLeft <= 4);
    this.nextBtn?.classList.toggle("is-hidden", maxScroll - scrollLeft <= 4);
  }

  buildDots() {
    if (!this.dotsContainer || !this.track) return;
    const items = [...this.track.children];

    this.dotsContainer.innerHTML = "";
    items.forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "video-carousel__dot";
      dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
      dot.addEventListener("click", () => this.scrollToIndex(index));
      this.dotsContainer.appendChild(dot);
    });
  }

  scrollToIndex(index) {
    const item = this.track.children[index];
    if (!item) return;
    this.track.scrollTo({ left: item.offsetLeft, behavior: "smooth" });
  }

  updateActiveDot() {
    if (!this.dotsContainer || !this.track) return;
    const items = [...this.track.children];
    const dots = [...this.dotsContainer.children];
    if (!items.length || !dots.length) return;

    const scrollLeft = this.track.scrollLeft;
    let closestIndex = 0;
    let closestDistance = Infinity;

    items.forEach((item, index) => {
      const distance = Math.abs(item.offsetLeft - scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    dots.forEach((dot, index) =>
      dot.classList.toggle("is-active", index === closestIndex),
    );
  }
}

customElements.define("video-carousel", VideoCarousel);
