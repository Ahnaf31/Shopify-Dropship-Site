class BuyBoxTiers extends HTMLElement {
  connectedCallback() {
    this.tiers = this.querySelectorAll("[data-tier]");
    this.template = this.querySelector("template[data-color-select-template]");
    this.addBtn = this.querySelector('[ref="addToCartBtn"]');
    this.errorMsg = this.querySelector('[ref="errorMsg"]');

    this.tiers.forEach((tier) => {
      const input = tier.querySelector('input[type="radio"]');
      input.addEventListener("change", () => this.onTierChange());
    });

    this.onTierChange();
    this.addBtn.addEventListener("click", () => this.addToCart());
  }

  onTierChange() {
    this.tiers.forEach((tier) => {
      const input = tier.querySelector('input[type="radio"]');
      const colorList = tier.querySelector("[data-color-list]");
      const isChecked = input.checked;

      tier.classList.toggle("buy-box-tiers__tier--checked", isChecked);

      if (isChecked) {
        const qty = parseInt(input.dataset.quantity, 10);
        colorList.innerHTML = "";
        for (let i = 0; i < qty; i++) {
          const clone = this.template.content.cloneNode(true);
          colorList.appendChild(clone);
        }
        colorList.querySelectorAll("[data-color-select]").forEach((select) => {
          select.addEventListener("change", () => this.updateSwatch(select));
          this.updateSwatch(select);
        });
      } else {
        colorList.innerHTML = "";
      }
    });
  }

  updateSwatch(select) {
    const option = select.selectedOptions[0];
    const row = select.closest(".buy-box-tiers__color-row");
    const img = row ? row.querySelector("[data-swatch-img]") : null;
    if (img && option && option.dataset.swatchSrc) {
      img.src = option.dataset.swatchSrc;
    }
  }

  getActiveColorsContainer() {
    return this.querySelector(
      ".buy-box-tiers__tier--checked [data-color-list]",
    );
  }

  async addToCart() {
    this.errorMsg.hidden = true;
    const container = this.getActiveColorsContainer();
    const selects = container.querySelectorAll("[data-color-select]");
    const items = [];

    for (const select of selects) {
      const option = select.selectedOptions[0];
      const variantId = option ? option.dataset.variantId : null;
      if (!variantId) {
        this.errorMsg.textContent =
          "Please select an available color for each unit.";
        this.errorMsg.hidden = false;
        return;
      }
      items.push({ id: parseInt(variantId, 10), quantity: 1 });
    }

    this.addBtn.disabled = true;
    this.addBtn.textContent = "Adding...";

    try {
      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.description || "Could not add to cart");
      }

      document.dispatchEvent(new CustomEvent("cart:update", { bubbles: true }));
      window.location.href = "/cart";
    } catch (e) {
      this.errorMsg.textContent = e.message;
      this.errorMsg.hidden = false;
    } finally {
      this.addBtn.disabled = false;
      this.addBtn.textContent = "Add to Cart";
    }
  }
}

customElements.define("buy-box-tiers", BuyBoxTiers);
