class UgcVideo extends HTMLElement {
  connectedCallback() {
    this.frame = this.querySelector(".ugc-video__frame");
    this.playBtn = this.querySelector("[data-ugc-play]");
    this.player = this.querySelector("[data-ugc-player]");
    this.embedContainer = this.querySelector("[data-ugc-embed]");
    this.userPlaying = false;

    this.frame?.addEventListener("click", () => this.toggle());
    this.frame?.addEventListener("mouseenter", () => this.previewPlay());
    this.frame?.addEventListener("mouseleave", () => this.previewPause());

    this.player?.addEventListener("ended", () => {
      this.userPlaying = false;
      this.setPlayingState(false);
      this.player.currentTime = 0;
    });
  }

  // Muted hover preview — only for native uploaded videos, and only before
  // the user has explicitly clicked to play with sound.
  previewPlay() {
    if (!this.player || this.userPlaying) return;
    this.player.muted = true;
    this.player.play();
  }

  previewPause() {
    if (!this.player || this.userPlaying) return;
    this.player.pause();
    this.player.currentTime = 0;
  }

  toggle() {
    if (this.player) {
      if (!this.userPlaying || this.player.paused) {
        this.play();
      } else {
        this.pause();
      }
    } else if (
      this.embedContainer &&
      !this.embedContainer.querySelector("iframe")
    ) {
      this.play();
    }
  }

  pause() {
    this.player.pause();
    this.setPlayingState(false);
  }

  play() {
    document.querySelectorAll("ugc-video").forEach((el) => {
      if (el === this) return;
      const otherPlayer = el.querySelector("[data-ugc-player]");
      if (otherPlayer && !otherPlayer.paused) {
        otherPlayer.pause();
        otherPlayer.currentTime = 0;
      }
      el.querySelector("[data-ugc-embed] iframe")?.remove();
      const otherBtn = el.querySelector("[data-ugc-play]");
      if (otherBtn) otherBtn.style.display = "";
      otherBtn?.classList.remove("is-playing");
      el.userPlaying = false;
    });

    if (this.player) {
      this.player.muted = false;
      this.player.play();
      this.userPlaying = true;
      this.setPlayingState(true);
      return;
    }

    const url = this.embedContainer?.dataset.embedUrl;
    const embedSrc = url && this.toEmbedUrl(url);

    if (!embedSrc) {
      this.embedContainer.innerHTML =
        '<p class="ugc-video__error">This video link isn\'t supported.</p>';
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.src = embedSrc;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    this.embedContainer.appendChild(iframe);
    this.userPlaying = true;
    this.setPlayingState(true);
    this.playBtn.style.display = "none";
  }

  setPlayingState(isPlaying) {
    this.playBtn.classList.toggle("is-playing", isPlaying);
    this.playBtn.setAttribute(
      "aria-label",
      isPlaying ? "Pause video" : "Play video",
    );
  }

  toEmbedUrl(url) {
    const platforms = [
      {
        test: /youtube\.com|youtu\.be/,
        getId: (u) =>
          u.match(
            /(?:youtu\.be\/|shorts\/|embed\/|v=)([a-zA-Z0-9_-]{11})/,
          )?.[1],
        embed: (id) =>
          `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`,
      },
      {
        test: /vimeo\.com/,
        getId: (u) => u.match(/vimeo\.com\/(?:.*\/)?(\d+)/)?.[1],
        embed: (id) => `https://player.vimeo.com/video/${id}?autoplay=1`,
      },
      {
        test: /loom\.com/,
        getId: (u) =>
          u.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/)?.[1],
        embed: (id) => `https://www.loom.com/embed/${id}?autoplay=1`,
      },
    ];

    const platform = platforms.find((p) => p.test.test(url));
    if (!platform) return url;

    const id = platform.getId(url);
    return id ? platform.embed(id) : null;
  }
}

customElements.define("ugc-video", UgcVideo);
