class VideoCarousel extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector("[data-carousel-track]");
    this.nextBtn = this.querySelector("[data-carousel-next]");
    this.prevBtn = this.querySelector("[data-carousel-prev]");

    this.nextBtn?.addEventListener("click", () => this.scrollByOne(1));
    this.prevBtn?.addEventListener("click", () => this.scrollByOne(-1));

    this.updateArrowVisibility();

    this.track?.addEventListener(
      "scroll",
      () => {
        this.updateArrowVisibility();
      },
      { passive: true },
    );
    window.addEventListener("resize", () => this.updateArrowVisibility());

    this.setupLightbox();
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

  /* ------------------------------------------------------------- lightbox --- */

  setupLightbox() {
    this.lightbox = this.querySelector("[data-carousel-lightbox]");
    if (!this.lightbox || !this.track) return;

    this.lightboxMedia = this.querySelector("[data-lightbox-media]");
    this.lightboxProgressTrack = this.querySelector(
      "[data-lightbox-progress-track]",
    );
    this.lightboxPlayPauseBtn = this.querySelector("[data-lightbox-playpause]");
    this.lightboxMuteBtn = this.querySelector("[data-lightbox-mute]");
    this.lightboxCloseTargets = this.querySelectorAll("[data-lightbox-close]");
    this.lightboxPrevBtn = this.querySelector("[data-lightbox-prev-v]");
    this.lightboxNextBtn = this.querySelector("[data-lightbox-next-v]");

    this.lightboxIndex = -1;
    this.lightboxItems = [];
    this.activeVideoEl = null;
    this.activeLightboxPlayer = null; // the cloned <video>, if native upload
    this.embedFallbackTimer = null;

    this.buildLightboxProgress();

    this.addEventListener("ugcvideo:open", (e) => {
      this.openLightbox(e.detail.videoEl);
    });

    // Clicking anywhere on the video/embed frame toggles play/pause,
    // mirroring the reference site's full-frame click-catcher.
    this.lightboxMedia?.addEventListener("click", () =>
      this.toggleLightboxPlayback(),
    );

    this.lightboxCloseTargets.forEach((el) =>
      el.addEventListener("click", () => this.closeLightbox()),
    );
    this.lightboxPrevBtn?.addEventListener("click", () =>
      this.gotoLightbox(this.lightboxIndex - 1),
    );
    this.lightboxNextBtn?.addEventListener("click", () =>
      this.gotoLightbox(this.lightboxIndex + 1),
    );
    this.lightboxPlayPauseBtn?.addEventListener("click", (e) => {
      e.stopPropagation(); // don't also trigger the media click above
      this.toggleLightboxPlayback();
    });
    this.lightboxMuteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleLightboxMute();
    });

    document.addEventListener("keydown", (e) => {
      if (!this.lightbox || this.lightbox.hidden) return;
      if (e.key === "Escape") this.closeLightbox();
      if (e.key === "ArrowUp") this.gotoLightbox(this.lightboxIndex - 1);
      if (e.key === "ArrowDown") this.gotoLightbox(this.lightboxIndex + 1);
    });
  }

  buildLightboxProgress() {
    if (!this.lightboxProgressTrack) return;
    this.lightboxItems = [...this.track.querySelectorAll("[data-ugc-video]")];
    this.lightboxProgressTrack.innerHTML = "";

    this.lightboxItems.forEach(() => {
      const segment = document.createElement("div");
      segment.className = "video-carousel__lightbox-progress-segment";
      const fill = document.createElement("div");
      fill.className = "video-carousel__lightbox-progress-fill";
      segment.appendChild(fill);
      this.lightboxProgressTrack.appendChild(segment);
    });
  }

  openLightbox(videoEl) {
    if (!this.lightbox) return;
    const index = this.lightboxItems.indexOf(videoEl);
    if (index === -1) return;

    this.lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    this.gotoLightbox(index);
  }

  closeLightbox() {
    if (!this.lightbox || this.lightbox.hidden) return;
    this.teardownCurrentLightboxMedia();
    this.lightbox.hidden = true;
    document.body.style.overflow = "";
    this.lightboxIndex = -1;
  }

  gotoLightbox(index) {
    if (!this.lightboxItems.length) return;
    if (index < 0 || index >= this.lightboxItems.length) return;

    this.teardownCurrentLightboxMedia();
    this.lightboxIndex = index;
    this.updateLightboxProgressUI();
    this.renderLightboxMedia(this.lightboxItems[index]);
  }

  // Fully stops and destroys whatever is currently playing in the lightbox.
  // Nothing here ever touches the original inline card's <video> element.
  teardownCurrentLightboxMedia() {
    clearInterval(this.embedFallbackTimer);
    this.embedFallbackTimer = null;

    if (this.activeLightboxPlayer) {
      this.activeLightboxPlayer.removeEventListener(
        "timeupdate",
        this.handleTimeUpdate,
      );
      this.activeLightboxPlayer.removeEventListener("ended", this.handleEnded);
      this.activeLightboxPlayer.pause();
      this.activeLightboxPlayer.removeAttribute("src");
      this.activeLightboxPlayer.load(); // fully release network/decoder resources
      this.activeLightboxPlayer.remove();
      this.activeLightboxPlayer = null;
    }

    if (this.lightboxMedia) this.lightboxMedia.innerHTML = "";
    this.activeVideoEl = null;
  }

  renderLightboxMedia(videoEl) {
    this.activeVideoEl = videoEl;
    this.lightboxMedia.innerHTML = "";

    const originalPlayer = videoEl.querySelector("[data-ugc-player]");
    const embed = videoEl.querySelector("[data-ugc-embed]");

    this.setLightboxMuteVisibility(!!originalPlayer);
    this.setLightboxPlayPauseVisibility(!!originalPlayer);

    if (originalPlayer) {
      // Build a fresh <video>, copying only the source/poster — never reuse
      // or move the card's own <video> node.
      const clone = document.createElement("video");
      clone.className = "ugc-video__player";
      clone.playsInline = true;
      clone.muted = false;
      clone.controls = false;
      clone.preload = "auto";
      if (originalPlayer.poster) clone.poster = originalPlayer.poster;

      [...originalPlayer.querySelectorAll("source")].forEach((source) => {
        const sourceClone = document.createElement("source");
        sourceClone.src = source.src;
        sourceClone.type = source.type;
        clone.appendChild(sourceClone);
      });

      this.lightboxMedia.appendChild(clone);
      this.activeLightboxPlayer = clone;

      clone.play().catch(() => {});
      this.setLightboxPlayingUI(true);

      this.handleTimeUpdate = () =>
        this.updateLightboxFillForCurrent(
          clone.currentTime / (clone.duration || 1),
        );
      this.handleEnded = () => this.gotoLightbox(this.lightboxIndex + 1);

      clone.addEventListener("timeupdate", this.handleTimeUpdate);
      clone.addEventListener("ended", this.handleEnded);
      return;
    }

    if (embed) {
      const url = embed.dataset.embedUrl;
      const embedSrc =
        url && typeof videoEl.toEmbedUrl === "function"
          ? videoEl.toEmbedUrl(url)
          : url;

      if (embedSrc) {
        const iframe = document.createElement("iframe");
        iframe.src = embedSrc;
        iframe.allow = "autoplay; encrypted-media; picture-in-picture";
        iframe.allowFullscreen = true;
        this.lightboxMedia.appendChild(iframe);
      }

      this.setLightboxPlayingUI(true);

      // Embeds (YouTube/Vimeo/Loom) don't expose reliable playback progress
      // without integrating each platform's own JS SDK, so this simulates a
      // fixed-duration progress bar and auto-advances after it. Clicking the
      // frame also won't toggle playback for embeds — cross-origin iframes
      // don't let click events bubble out to this script.
      const FALLBACK_DURATION_MS = 15000;
      const start = performance.now();
      this.embedFallbackTimer = setInterval(() => {
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / FALLBACK_DURATION_MS, 1);
        this.updateLightboxFillForCurrent(progress);
        if (progress >= 1) {
          clearInterval(this.embedFallbackTimer);
          this.gotoLightbox(this.lightboxIndex + 1);
        }
      }, 100);
    }
  }

  updateLightboxProgressUI() {
    if (!this.lightboxProgressTrack) return;
    [...this.lightboxProgressTrack.children].forEach((segment, i) => {
      const fill = segment.querySelector(
        ".video-carousel__lightbox-progress-fill",
      );
      segment.classList.toggle("is-complete", i < this.lightboxIndex);
      if (fill) fill.style.width = i < this.lightboxIndex ? "100%" : "0%";
    });
  }

  updateLightboxFillForCurrent(ratio) {
    const segment = this.lightboxProgressTrack?.children[this.lightboxIndex];
    const fill = segment?.querySelector(
      ".video-carousel__lightbox-progress-fill",
    );
    if (fill) fill.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
  }

  toggleLightboxPlayback() {
    const player = this.activeLightboxPlayer;
    if (!player) return;
    if (player.paused) {
      player.play();
      this.setLightboxPlayingUI(true);
    } else {
      player.pause();
      this.setLightboxPlayingUI(false);
    }
  }

  setLightboxPlayingUI(isPlaying) {
    const pauseIcon = this.lightboxPlayPauseBtn?.querySelector(
      ".video-carousel__lightbox-icon--pause",
    );
    const playIcon = this.lightboxPlayPauseBtn?.querySelector(
      ".video-carousel__lightbox-icon--play",
    );
    if (pauseIcon) pauseIcon.style.display = isPlaying ? "" : "none";
    if (playIcon) playIcon.style.display = isPlaying ? "none" : "";
  }

  setLightboxPlayPauseVisibility(show) {
    if (this.lightboxPlayPauseBtn)
      this.lightboxPlayPauseBtn.style.display = show ? "" : "none";
  }

  toggleLightboxMute() {
    const player = this.activeLightboxPlayer;
    if (!player) return;
    player.muted = !player.muted;

    const onIcons = this.lightboxMuteBtn?.querySelectorAll(
      "[data-lightbox-mute-on]",
    );
    const offIcon = this.lightboxMuteBtn?.querySelector(
      "[data-lightbox-mute-off]",
    );
    onIcons?.forEach((el) => (el.style.display = player.muted ? "none" : ""));
    if (offIcon) offIcon.style.display = player.muted ? "" : "none";
  }

  setLightboxMuteVisibility(show) {
    if (this.lightboxMuteBtn)
      this.lightboxMuteBtn.style.display = show ? "" : "none";
  }
}

customElements.define("video-carousel", VideoCarousel);
