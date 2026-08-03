/**
 * <buy-box-tiers>
 *
 * Quantity-tiers buy box with per-unit variant selection.
 *
 * Adapts to the product automatically:
 *   - product has no real variants  -> no selectors are rendered at all
 *   - product has 1..n options      -> one dropdown per option, per unit
 *
 * The exact variant is resolved from the FULL option combination
 * (e.g. Color = White AND Size = Large), never from a single option value.
 */

/** Notify themes that use Shopify's pub/sub bus (Dawn-style) as well. */
import { CartLinesUpdateEvent, CartErrorEvent } from "@shopify/events";

/**
 * Best-effort notification for themes that rely on Shopify's legacy pub/sub bus.
 * @param {{ data: unknown }} detail
 */
function publishIfAvailable(detail) {
  try {
    const w = /** @type {any} */ (window);
    if (typeof w.publish === "function" && w.PUB_SUB_EVENTS) {
      w.publish(w.PUB_SUB_EVENTS.cartUpdate, detail.data);
    }
  } catch (e) {
    /* optional */
  }
}

class BuyBoxTiers extends HTMLElement {
  /** @type {HTMLElement[]} */
  tiers = [];
  /** @type {HTMLTemplateElement | null} */
  template = null;
  /** @type {HTMLButtonElement | null} */
  addBtn = null;
  /** @type {HTMLElement | null} */
  errorMsg = null;

  /** @type {boolean} */
  hasOptions = false;
  /** @type {number} */
  optionCount = 0;
  /** @type {number} */
  defaultVariantId = 0;
  /** @type {boolean} */
  redirectToCart = false;

  /** @type {{ soldOut: string; unavailable: string; adding: string; add: string }} */
  text = { soldOut: "", unavailable: "", adding: "", add: "" };

  /** @type {any[]} */
  variants = [];

  connectedCallback() {
    this.tiers = /** @type {HTMLElement[]} */ (
      Array.from(this.querySelectorAll("[data-tier]"))
    );
    this.template = /** @type {HTMLTemplateElement | null} */ (
      this.querySelector("template[data-option-group-template]")
    );
    this.addBtn = /** @type {HTMLButtonElement | null} */ (
      this.querySelector('[ref="addToCartBtn"]')
    );
    this.errorMsg = /** @type {HTMLElement | null} */ (
      this.querySelector('[ref="errorMsg"]')
    );

    this.hasOptions = this.dataset.hasOptions === "true";
    this.optionCount = parseInt(this.dataset.optionCount || "0", 10);
    this.defaultVariantId = parseInt(this.dataset.defaultVariantId || "0", 10);
    this.redirectToCart = this.dataset.redirectToCart === "true";

    this.text = {
      soldOut: this.dataset.soldOutText || "Sold out",
      unavailable:
        this.dataset.unavailableText || "This combination is unavailable",
      adding: this.dataset.addingText || "Adding...",
      add: this.dataset.addText || "Add to cart",
    };

    this.variants = this.readVariantData();

    this.tiers.forEach((tier) => {
      const input = /** @type {HTMLInputElement | null} */ (
        tier.querySelector('input[type="radio"]')
      );
      if (input) input.addEventListener("change", () => this.onTierChange());
    });

    this.onTierChange();

    if (this.addBtn) {
      this.addBtn.addEventListener("click", () => this.addToCart());
    }
  }

  readVariantData() {
    const node = this.querySelector("script[data-variant-data]");
    if (!node) return [];
    try {
      const parsed = JSON.parse(node.textContent ?? "");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /* ---------------------------------------------------------- tiers ---- */

  onTierChange() {
    this.tiers.forEach((tier) => {
      const input = /** @type {HTMLInputElement | null} */ (
        tier.querySelector('input[type="radio"]')
      );
      const isChecked = !!input && input.checked;

      tier.classList.toggle("buy-box-tiers__tier--checked", isChecked);

      const list = /** @type {HTMLElement | null} */ (
        tier.querySelector("[data-option-list]")
      );
      if (!list) return; // product has no options: nothing to render

      if (!isChecked) {
        list.innerHTML = "";
        return;
      }

      const qty = Math.max(
        1,
        parseInt(input?.dataset.quantity ?? "1", 10) || 1,
      );
      list.innerHTML = "";

      if (!this.template) return;

      for (let i = 0; i < qty; i++) {
        const clone = this.template.content.cloneNode(true);
        list.appendChild(clone);
      }

      const groups = /** @type {HTMLElement[]} */ (
        Array.from(list.querySelectorAll("[data-option-group]"))
      );
      groups.forEach((group) => {
        const selects = /** @type {HTMLSelectElement[]} */ (
          Array.from(group.querySelectorAll("[data-option-select]"))
        );
        selects.forEach((select) => {
          select.addEventListener("change", () => this.onOptionChange(group));
        });
        this.onOptionChange(group);
      });
    });

    this.refreshButtonState();
  }

  /* -------------------------------------------------------- variants ---- */

  /** @param {HTMLElement} group */
  getSelectedOptions(group) {
    const selects = /** @type {HTMLSelectElement[]} */ (
      Array.from(group.querySelectorAll("[data-option-select]"))
    );
    return selects.map((select) => select.value);
  }

  /** @param {string[]} options */
  findVariant(options) {
    return this.variants.find((variant) => {
      if (!Array.isArray(variant.options)) return false;
      if (variant.options.length !== options.length) return false;
      return variant.options.every(
        (/** @type {string} */ value, /** @type {number} */ index) =>
          value === options[index],
      );
    });
  }

  /**
   * Disable option values that cannot produce an available variant.
   * @param {HTMLElement} group
   */
  updateAvailability(group) {
    const selects = /** @type {HTMLSelectElement[]} */ (
      Array.from(group.querySelectorAll("[data-option-select]"))
    );

    selects.forEach((select, index) => {
      const preceding = selects.slice(0, index).map((s) => s.value);
      let hasUsableSelection = false;
      /** @type {string | null} */
      let firstUsable = null;

      Array.from(select.options).forEach((opt) => {
        const match = this.variants.find((variant) => {
          if (!Array.isArray(variant.options)) return false;
          if (variant.options[index] !== opt.value) return false;
          return preceding.every((value, i) => variant.options[i] === value);
        });

        const usable = !!match && match.available;
        opt.disabled = !usable;

        const base = opt.dataset.baseLabel || (opt.textContent ?? "").trim();
        opt.dataset.baseLabel = base;
        opt.textContent = usable ? base : `${base} - ${this.text.soldOut}`;

        if (usable) {
          if (firstUsable === null) firstUsable = opt.value;
          if (opt.value === select.value) hasUsableSelection = true;
        }
      });

      if (!hasUsableSelection && firstUsable !== null) {
        select.value = firstUsable;
      }
    });
  }

  /** @param {HTMLElement} group */
  onOptionChange(group) {
    this.updateAvailability(group);

    const options = this.getSelectedOptions(group);
    const variant = this.findVariant(options);
    const status = /** @type {HTMLElement | null} */ (
      group.querySelector("[data-unit-status]")
    );
    const img = /** @type {HTMLImageElement | null} */ (
      group.querySelector("[data-swatch-img]")
    );

    if (variant) {
      group.dataset.variantId = variant.id;
      group.dataset.available = variant.available ? "true" : "false";

      if (img && variant.image) img.src = variant.image;

      if (status) {
        if (variant.available) {
          status.hidden = true;
          status.textContent = "";
        } else {
          status.hidden = false;
          status.textContent = this.text.soldOut;
        }
      }
    } else {
      delete group.dataset.variantId;
      group.dataset.available = "false";

      if (status) {
        status.hidden = false;
        status.textContent = this.text.unavailable;
      }
    }

    this.refreshButtonState();
  }

  /* ---------------------------------------------------------- button ---- */

  getActiveTier() {
    return this.tiers.find((tier) => {
      const input = /** @type {HTMLInputElement | null} */ (
        tier.querySelector('input[type="radio"]')
      );
      return !!input && input.checked;
    });
  }

  getActiveGroups() {
    const tier = this.getActiveTier();
    if (!tier) return [];
    return /** @type {HTMLElement[]} */ (
      Array.from(tier.querySelectorAll("[data-option-group]"))
    );
  }

  isSelectionValid() {
    if (!this.hasOptions) return true;
    const groups = this.getActiveGroups();
    if (!groups.length) return false;
    return groups.every(
      (group) =>
        group.dataset.available === "true" && !!group.dataset.variantId,
    );
  }

  refreshButtonState() {
    if (!this.addBtn || this.addBtn.dataset.busy === "true") return;
    const valid = this.isSelectionValid();
    this.addBtn.disabled = !valid;
    this.addBtn.textContent = valid ? this.text.add : this.text.soldOut;
  }

  /* ------------------------------------------------------------ cart ---- */

  buildItems() {
    const tier = this.getActiveTier();
    if (!tier) return [];
    const input = /** @type {HTMLInputElement | null} */ (
      tier.querySelector('input[type="radio"]')
    );
    if (!input) return [];
    const qty = Math.max(1, parseInt(input.dataset.quantity ?? "1", 10) || 1);
    const tierLabel =
      tier.querySelector(".buy-box-tiers__tier-label")?.textContent?.trim() ||
      "Bundle";

    if (!this.hasOptions) {
      if (!this.defaultVariantId) return [];
      return [
        {
          id: this.defaultVariantId,
          quantity: qty,
          properties: { _Bundle: tierLabel },
        },
      ];
    }

    const counts = new Map();
    for (const group of this.getActiveGroups()) {
      const id = parseInt(group.dataset.variantId ?? "", 10);
      if (!id) return null;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return Array.from(counts, ([id, quantity]) => ({
      id,
      quantity,
      properties: { _Bundle: tierLabel },
    }));
  }

  /** @param {string} message */
  showError(message) {
    if (!this.errorMsg) return;
    this.errorMsg.textContent = message;
    this.errorMsg.hidden = false;
  }

  clearError() {
    if (!this.errorMsg) return;
    this.errorMsg.hidden = true;
    this.errorMsg.textContent = "";
  }

  /**
   * Section ids Horizon needs re-rendered after a cart change.
   */
  getCartSectionIds() {
    const ids = new Set();
    document
      .querySelectorAll(
        "cart-drawer-component[data-section-id], cart-items-component[data-section-id], cart-icon-component[data-section-id], [id^='shopify-section-'] cart-drawer-component, [id^='shopify-section-'] cart-icon-component",
      )
      .forEach((el) => {
        const explicit =
          el instanceof HTMLElement ? el.dataset.sectionId : undefined;
        if (explicit) {
          ids.add(explicit);
          return;
        }
        const wrapper = el.closest("[id^='shopify-section-']");
        if (wrapper && wrapper.id) {
          ids.add(wrapper.id.replace("shopify-section-", ""));
        }
      });

    // Horizon's default cart sections.
    ids.add("cart-drawer");
    ids.add("cart-icon-bubble");

    return Array.from(ids);
  }

  /** Swap in freshly rendered section HTML returned by /cart/add.js. */
  /** @param {Record<string, string>} sections */
  renderSections(sections) {
    if (!sections) return;

    Object.entries(sections).forEach(([id, html]) => {
      if (typeof html !== "string") return;

      const doc = new DOMParser().parseFromString(html, "text/html");

      // Virtual sections (e.g. cart-icon-bubble) render as a bare element
      // with that id — no shopify-section- wrapper. Try that match first.
      const directTarget = document.getElementById(id);
      const directFresh = doc.getElementById(id);

      if (directTarget && directFresh) {
        directTarget.innerHTML = directFresh.innerHTML;
        return;
      }

      // Fall back to real, page-rendered sections.
      const target =
        document.getElementById(`shopify-section-${id}`) ||
        (document
          .querySelector(`[data-section-id="${id}"]`)
          ?.closest("[id^='shopify-section-']") ??
          null);

      if (!target) return;

      const fresh =
        doc.getElementById(`shopify-section-${id}`) ||
        doc.body.firstElementChild;
      if (fresh) {
        /** @type {HTMLElement} */ (target).innerHTML =
          /** @type {HTMLElement} */ (fresh).innerHTML;
      }
    });
  }

  openCartDrawer() {
    const drawer = /** @type {(HTMLElement & { open?: () => void }) | null} */ (
      document.querySelector("cart-drawer-component")
    );
    if (!drawer) return;

    if (typeof drawer.open === "function") {
      drawer.open();
      return;
    }

    // Horizon opens the drawer through its dialog component.
    const dialog = /** @type {HTMLDialogElement | null} */ (
      drawer.querySelector("dialog")
    );
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    }
  }

  async addToCart() {
    this.clearError();

    const items = this.buildItems();
    if (!items || !items.length) {
      this.showError(this.text.unavailable);
      return;
    }

    if (!this.addBtn) return;
    this.addBtn.dataset.busy = "true";
    this.addBtn.disabled = true;
    this.addBtn.textContent = this.text.adding;

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const deferred = CartLinesUpdateEvent.createPromise();

    // Dispatch BEFORE the fetch — cart-icon.js awaits event.promise, it
    // doesn't read detail values off this event directly.
    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: "add",
        context: "product",
        lines: items.map((item) => ({
          merchandiseId: String(item.id),
          quantity: item.quantity,
        })),
        promise: deferred.promise,
      }),
    );

    try {
      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ items, sections: this.getCartSectionIds() }),
      });

      if (!response.ok) {
        let message = "Could not add to cart";
        try {
          const err = await response.json();
          message = err.description || err.message || message;
        } catch (e) {}
        throw new Error(message);
      }

      const result = await response.json().catch(() => ({}));

      if (this.redirectToCart) {
        window.location.href = "/cart";
        return;
      }

      this.renderSections(result.sections);

      let cart = null;
      try {
        cart = await (
          await fetch("/cart.js", { headers: { Accept: "application/json" } })
        ).json();
      } catch (e) {}

      // Resolve the promise cart-icon.js is waiting on.
      deferred.resolve({
        cart: cart
          ? CartLinesUpdateEvent.createCartFromAjaxResponse(cart)
          : null,
        detail: {
          source: "buy-box-tiers",
          itemCount: cart ? cart.item_count : itemCount,
          productId: result.id,
          sections: result.sections,
          cart,
        },
      });

      this.openCartDrawer();
    } catch (e) {
      this.dispatchEvent(
        new CartErrorEvent({ error: e.message, code: "SERVICE_UNAVAILABLE" }),
      );
      deferred.reject(e); // Unresolved promises make cart-icon.js hang forever
      this.showError(e.message);
    } finally {
      if (this.addBtn) {
        this.addBtn.dataset.busy = "false";
        this.addBtn.textContent = this.text.add;
      }
      this.refreshButtonState();
    }
  }
}

if (!customElements.get("buy-box-tiers")) {
  customElements.define("buy-box-tiers", BuyBoxTiers);
}
