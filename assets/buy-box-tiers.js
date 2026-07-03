class BuyBoxTiers extends HTMLElement {
  connectedCallback() {
    this.colorSlots = this.querySelector('[ref="colorSlots"]');
    this.template = this.querySelector("template[data-color-select-template]");
    this.addBtn = this.querySelector('[ref="addToCartBtn"]');
    this.errorMsg = this.querySelector('[ref="errorMsg"]');
    this.tierInputs = this.querySelectorAll('input[type="radio"]');

    this.tierInputs.forEach((input) => {
      input.addEventListener("change", () => this.renderColorSlots());
    });

    this.addBtn.addEventListener("click", () => this.addToCart());

    this.renderColorSlots();
  }

  getSelectedQuantity() {
    const checked = this.querySelector('input[type="radio"]:checked');
    return checked ? parseInt(checked.dataset.quantity, 10) : 1;
  }

  renderColorSlots() {
    const qty = this.getSelectedQuantity();
    this.colorSlots.innerHTML = "";
    for (let i = 0; i < qty; i++) {
      const clone = this.template.content.cloneNode(true);
      this.colorSlots.appendChild(clone);
    }
    this.tierInputs.forEach((input) => {
      input
        .closest(".buy-box-tiers__tier")
        .classList.toggle("buy-box-tiers__tier--checked", input.checked);
    });
  }

  async addToCart() {
    this.errorMsg.hidden = true;
    const selects = this.colorSlots.querySelectorAll("[data-color-select]");
    const items = [];

    for (const select of selects) {
      const option = select.selectedOptions[0];
      const variantId = option?.dataset.variantId;
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
