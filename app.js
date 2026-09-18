// ============================================================
// TENDRIL & TWINE — FRONTEND APP LOGIC
// Talks to the real backend for products, coupons, freebies,
// order creation and Razorpay payment verification.
// Cart state lives in localStorage (this is your own hosted
// site, not a Claude.ai artifact, so localStorage is fine here).
// ============================================================

const API = APP_CONFIG.API_BASE_URL;
const CART_KEY = "tt_cart_v1";

let PRODUCTS = [];
let FREEBIES = [];
let PUBLIC_CONFIG = null;

// ---------- helpers ----------
const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartBadge();
}
function addToCart(productId, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.productId === productId);
  if (existing) existing.quantity = Math.min(existing.quantity + qty, 10);
  else cart.push({ productId, quantity: qty });
  saveCart(cart);
  openCartDrawer();
}
function removeFromCart(productId) {
  saveCart(getCart().filter(i => i.productId !== productId));
  renderCartDrawer();
}
function setQty(productId, qty) {
  const cart = getCart();
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  item.quantity = Math.max(1, Math.min(10, qty));
  saveCart(cart);
  renderCartDrawer();
}
function cartCount() {
  return getCart().reduce((n, i) => n + i.quantity, 0);
}

// ---------- API calls ----------
async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ---------- init ----------
async function init() {
  wireStaticUI();
  try {
    [PRODUCTS, FREEBIES, PUBLIC_CONFIG] = await Promise.all([
      apiGet("/api/products"),
      apiGet("/api/freebies"),
      apiGet("/api/config/public"),
    ]);
  } catch (err) {
    showBackendOfflineBanner();
    return;
  }
  renderProductGrid();
  renderCartBadge();
  handleRoute();
}

function showBackendOfflineBanner() {
  const banner = document.createElement("div");
  banner.className = "offline-banner";
  banner.innerHTML = `⚠️ Can't reach the backend at <code>${API}</code>. Start it with <code>npm start</code> inside <code>/backend</code>, then refresh.`;
  document.body.prepend(banner);
}

function wireStaticUI() {
  $("#cartTrigger")?.addEventListener("click", openCartDrawer);
  $("#cartClose")?.addEventListener("click", closeCartDrawer);
  $("#cartOverlay")?.addEventListener("click", closeCartDrawer);
  $("#goToCheckout")?.addEventListener("click", () => { closeCartDrawer(); goTo("checkout"); });
  $("#backToShop")?.addEventListener("click", () => goTo("home"));
  $("#checkoutForm")?.addEventListener("submit", onCheckoutSubmit);
  $("#applyCouponBtn")?.addEventListener("click", onApplyCoupon);
  $("#removeCouponBtn")?.addEventListener("click", onRemoveCoupon);

  const waLink = `https://wa.me/${APP_CONFIG.WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent("Hi Tendril & Twine! I need help with my order/query.")}`;
  $$(".js-whatsapp-support").forEach(a => a.href = waLink);
  $$(".js-instagram-link").forEach(a => { a.href = APP_CONFIG.INSTAGRAM_URL; a.textContent = a.textContent || APP_CONFIG.INSTAGRAM_HANDLE; });
}

// ---------- simple hash router ----------
function goTo(view, param) {
  window.location.hash = param ? `${view}/${param}` : view;
}
window.addEventListener("hashchange", handleRoute);

function handleRoute() {
  const [view, param] = (window.location.hash || "#home").slice(1).split("/");
  $$(".view").forEach(v => v.classList.remove("active"));
  window.scrollTo({ top: 0, behavior: "instant" });

  if (view === "product" && param) {
    renderProductDetail(param);
    $("#view-product").classList.add("active");
  } else if (view === "checkout") {
    renderCheckout();
    $("#view-checkout").classList.add("active");
  } else if (view === "confirmation" && param) {
    renderConfirmation(param);
    $("#view-confirmation").classList.add("active");
  } else {
    $("#view-home").classList.add("active");
  }
}

// ---------- product grid ----------
function renderProductGrid() {
  const grid = $("#productGrid");
  if (!grid) return;
  grid.innerHTML = PRODUCTS.map(p => `
    <div class="p-card">
      <a href="#product/${p.id}" class="p-media" style="background-image:url('${p.images[0]}')">
        ${p.freebieEligible ? `<span class="p-badge">Free gift 🎁</span>` : ""}
      </a>
      <div class="p-body">
        <a href="#product/${p.id}"><h3>${p.name}</h3></a>
        <div class="tag">${p.shortDescription}</div>
        <div class="p-row">
          <div class="p-price">${money(p.price)}</div>
          <button class="p-buy" data-add="${p.id}">Add to Cart</button>
        </div>
      </div>
    </div>
  `).join("");

  $$("[data-add]", grid).forEach(btn =>
    btn.addEventListener("click", (e) => { e.preventDefault(); addToCart(btn.dataset.add, 1); })
  );
}

// ---------- product detail ----------
function renderProductDetail(id) {
  const p = PRODUCTS.find(x => x.id === id);
  const root = $("#view-product");
  if (!p) { root.innerHTML = `<div class="wrap"><p>Product not found.</p></div>`; return; }

  root.innerHTML = `
    <div class="wrap pd-wrap">
      <a href="#home" class="back-link">← Back to shop</a>
      <div class="pd-grid">
        <div class="pd-gallery">
          <div class="pd-main" style="background-image:url('${p.images[0]}')"></div>
          <div class="pd-thumbs">
            ${p.images.map(img => `<div class="pd-thumb" style="background-image:url('${img}')"></div>`).join("")}
          </div>
        </div>
        <div class="pd-info">
          ${p.freebieEligible ? `<div class="pd-freebie-note">🎁 Choose your complimentary crochet gift at checkout.</div>` : ""}
          <h1>${p.name}</h1>
          <div class="pd-price">${money(p.price)}</div>
          <p class="pd-desc">${p.description}</p>
          <table class="pd-specs">
            <tr><td>Flowers</td><td>${p.flowerTypes.join(", ")}</td></tr>
            <tr><td>Colour</td><td>${p.colour}</td></tr>
            <tr><td>Size</td><td>${p.approxSize}</td></tr>
            <tr><td>Good for</td><td>${p.giftSuitability.join(", ")}</td></tr>
            <tr><td>Stock</td><td class="${p.stockStatus === 'in_stock' ? 'stock-yes' : 'stock-no'}">${p.stockStatus === 'in_stock' ? 'In stock' : 'Out of stock'}</td></tr>
          </table>
          <div class="pd-ctas">
            <button class="btn btn-ghost" id="pdAddCart" ${p.stockStatus !== 'in_stock' ? 'disabled' : ''}>Add to Cart</button>
            <button class="btn btn-primary" id="pdBuyNow" ${p.stockStatus !== 'in_stock' ? 'disabled' : ''}>Buy Now</button>
          </div>
          <div class="pd-meta">
            <p><strong>Care:</strong> ${p.careInstructions}</p>
            <p><strong>Delivery:</strong> ${p.deliveryInfo}</p>
            <p><strong>Prepaid orders only</strong> — Cash on Delivery is currently unavailable.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#pdAddCart")?.addEventListener("click", () => addToCart(p.id, 1));
  $("#pdBuyNow")?.addEventListener("click", () => { addToCart(p.id, 1); goTo("checkout"); });
}

// ---------- cart drawer ----------
function openCartDrawer() {
  $("#cartDrawer")?.classList.add("open");
  $("#cartOverlay")?.classList.add("open");
  renderCartDrawer();
}
function closeCartDrawer() {
  $("#cartDrawer")?.classList.remove("open");
  $("#cartOverlay")?.classList.remove("open");
}
function renderCartBadge() {
  const badge = $("#cartCount");
  if (badge) badge.textContent = cartCount();
}
function renderCartDrawer() {
  const list = $("#cartItems");
  if (!list) return;
  const cart = getCart();
  if (cart.length === 0) {
    list.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
    $("#cartSubtotal").textContent = money(0);
    $("#goToCheckout").disabled = true;
    return;
  }
  $("#goToCheckout").disabled = false;

  let subtotal = 0;
  list.innerHTML = cart.map(item => {
    const p = PRODUCTS.find(x => x.id === item.productId);
    if (!p) return "";
    const lineTotal = p.price * item.quantity;
    subtotal += lineTotal;
    return `
      <div class="cart-item">
        <div class="ci-img" style="background-image:url('${p.images[0]}')"></div>
        <div class="ci-body">
          <div class="ci-name">${p.name}</div>
          <div class="ci-price">${money(p.price)}</div>
          <div class="ci-qty">
            <button data-dec="${p.id}">−</button>
            <span>${item.quantity}</span>
            <button data-inc="${p.id}">+</button>
            <button class="ci-remove" data-remove="${p.id}">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  $("#cartSubtotal").textContent = money(subtotal);

  $$("[data-inc]", list).forEach(b => b.addEventListener("click", () => {
    const item = cart.find(i => i.productId === b.dataset.inc);
    setQty(b.dataset.inc, item.quantity + 1);
  }));
  $$("[data-dec]", list).forEach(b => b.addEventListener("click", () => {
    const item = cart.find(i => i.productId === b.dataset.dec);
    if (item.quantity <= 1) removeFromCart(b.dataset.dec);
    else setQty(b.dataset.dec, item.quantity - 1);
  }));
  $$("[data-remove]", list).forEach(b => b.addEventListener("click", () => removeFromCart(b.dataset.remove)));
}

// ---------- checkout ----------
let checkoutState = { couponCode: null, freebieId: null, totals: null };

function renderCheckout() {
  const cart = getCart();
  const root = $("#view-checkout");
  if (cart.length === 0) {
    $("#checkoutEmpty").style.display = "block";
    $("#checkoutContent").style.display = "none";
    return;
  }
  $("#checkoutEmpty").style.display = "none";
  $("#checkoutContent").style.display = "grid";

  const anyFreebieEligible = cart.some(i => {
    const p = PRODUCTS.find(x => x.id === i.productId);
    return p && p.freebieEligible;
  });
  $("#freebieSection").style.display = anyFreebieEligible ? "block" : "none";
  if (anyFreebieEligible && $("#freebieOptions").children.length === 0) {
    $("#freebieOptions").innerHTML = FREEBIES.map(f => `
      <label class="freebie-opt">
        <input type="radio" name="freebie" value="${f.id}">
        <span>${f.emoji} ${f.name}</span>
      </label>
    `).join("");
    $$('input[name="freebie"]').forEach(r => r.addEventListener("change", () => {
      checkoutState.freebieId = r.value;
    }));
  }

  recalcOrderSummary();
}

async function recalcOrderSummary() {
  const cart = getCart();
  const items = cart.map(i => ({ productId: i.productId, quantity: i.quantity }));
  const summaryBox = $("#orderSummary");
  try {
    const totals = await apiPost("/api/coupons/validate", {
      items,
      couponCode: checkoutState.couponCode,
      mobile: $("#mobile")?.value || null,
    });
    checkoutState.totals = totals;
    renderOrderSummary(totals);
  } catch (err) {
    // If coupon itself was invalid, clear it and retry without coupon
    if (checkoutState.couponCode) {
      $("#couponError").textContent = err.message;
      checkoutState.couponCode = null;
      const totals = await apiPost("/api/coupons/validate", { items, couponCode: null });
      checkoutState.totals = totals;
      renderOrderSummary(totals);
    }
  }
}

function renderOrderSummary(totals) {
  $("#summaryItems").innerHTML = totals.lineItems.map(li => `
    <div class="sum-row"><span>${li.name} × ${li.quantity}</span><span>${money(li.lineTotal)}</span></div>
  `).join("");
  $("#summarySubtotal").textContent = money(totals.subtotal);

  const discountRow = $("#summaryDiscountRow");
  if (totals.appliedCoupon) {
    discountRow.style.display = "flex";
    $("#summaryDiscountLabel").textContent = `Coupon (${totals.appliedCoupon.code})`;
    $("#summaryDiscount").textContent = `− ${money(totals.appliedCoupon.discount)}`;
    $("#appliedCouponBox").style.display = "flex";
    $("#appliedCouponCode").textContent = totals.appliedCoupon.code;
  } else {
    discountRow.style.display = "none";
    $("#appliedCouponBox").style.display = "none";
  }

  $("#summaryDelivery").textContent = totals.deliveryCharge === 0 ? "FREE" : money(totals.deliveryCharge);

  if (checkoutState.freebieId) {
    $("#summaryFreebieRow").style.display = "flex";
    const f = FREEBIES.find(x => x.id === checkoutState.freebieId);
    $("#summaryFreebieName").textContent = f ? `${f.emoji} ${f.name}` : "";
  } else {
    $("#summaryFreebieRow").style.display = "none";
  }

  $("#summaryTotal").textContent = money(totals.total);
  $("#payButton").textContent = `Pay ${money(totals.total)} Securely`;
}

async function onApplyCoupon() {
  const code = $("#couponInput").value.trim();
  $("#couponError").textContent = "";
  if (!code) return;
  checkoutState.couponCode = code;
  try {
    await recalcOrderSummary();
  } catch (err) {
    $("#couponError").textContent = err.message;
    checkoutState.couponCode = null;
  }
}
function onRemoveCoupon() {
  checkoutState.couponCode = null;
  $("#couponInput").value = "";
  $("#couponError").textContent = "";
  recalcOrderSummary();
}

async function onCheckoutSubmit(e) {
  e.preventDefault();
  const errBox = $("#checkoutFormError");
  errBox.textContent = "";

  const customer = {
    name: $("#fullName").value.trim(),
    mobile: $("#mobile").value.trim(),
    email: $("#email").value.trim(),
  };
  const address = {
    line1: $("#addrLine1").value.trim(),
    landmark: $("#addrLandmark").value.trim(),
    city: $("#addrCity").value.trim(),
    state: $("#addrState").value.trim(),
    pincode: $("#addrPincode").value.trim(),
  };

  // basic client-side checks (backend re-validates everything regardless)
  if (!/^[6-9]\d{9}$/.test(customer.mobile)) { errBox.textContent = "Enter a valid 10-digit mobile number."; return; }
  if (!/^\S+@\S+\.\S+$/.test(customer.email)) { errBox.textContent = "Enter a valid email address."; return; }
  if (!/^[1-9][0-9]{5}$/.test(address.pincode)) { errBox.textContent = "Enter a valid 6-digit pincode."; return; }
  if (!customer.name || !address.line1 || !address.city || !address.state) { errBox.textContent = "Please fill in all required fields."; return; }

  const payBtn = $("#payButton");
  payBtn.disabled = true;
  payBtn.textContent = "Preparing secure payment…";

  const items = getCart().map(i => ({ productId: i.productId, quantity: i.quantity }));

  try {
    const orderRes = await apiPost("/api/orders/create", {
      items,
      couponCode: checkoutState.couponCode,
      freebieId: checkoutState.freebieId,
      customer,
      address,
    });
    launchRazorpay(orderRes, customer);
  } catch (err) {
    errBox.textContent = err.message || "Could not start payment. Please try again.";
    payBtn.disabled = false;
    payBtn.textContent = `Pay ${checkoutState.totals ? money(checkoutState.totals.total) : ""} Securely`;
  }
}

function launchRazorpay(orderRes, customer) {
  if (typeof Razorpay === "undefined") {
    $("#checkoutFormError").textContent = "Payment library failed to load. Check your internet connection and try again.";
    resetPayButton();
    return;
  }
  const options = {
    key: orderRes.keyId,
    amount: orderRes.amount,
    currency: orderRes.currency,
    name: "Tendril & Twine",
    description: "Handmade velvet bouquet order",
    order_id: orderRes.razorpayOrderId,
    prefill: { name: customer.name, contact: customer.mobile, email: customer.email },
    theme: { color: "#5B3548" },
    handler: async function (response) {
      try {
        const verifyRes = await apiPost("/api/orders/verify", {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
        if (verifyRes.verified) {
          localStorage.removeItem(CART_KEY);
          renderCartBadge();
          goTo("confirmation", orderRes.internalOrderId);
        } else {
          $("#checkoutFormError").textContent = "Payment could not be verified. If money was deducted, contact support with your order details.";
          resetPayButton();
        }
      } catch (err) {
        $("#checkoutFormError").textContent = "Payment verification failed. If money was deducted, contact support — do not retry blindly.";
        resetPayButton();
      }
    },
    modal: {
      ondismiss: function () { resetPayButton(); },
    },
  };
  const rzp = new Razorpay(options);
  rzp.on('payment.failed', function () {
    $("#checkoutFormError").textContent = "Payment failed or was declined. You can try again.";
    resetPayButton();
  });
  rzp.open();
}

function resetPayButton() {
  const payBtn = $("#payButton");
  payBtn.disabled = false;
  payBtn.textContent = checkoutState.totals ? `Pay ${money(checkoutState.totals.total)} Securely` : "Pay Securely";
}

// ---------- confirmation ----------
async function renderConfirmation(orderId) {
  const root = $("#view-confirmation");
  try {
    const order = await apiGet(`/api/orders/${orderId}`);
    if (order.paymentStatus !== "paid") {
      root.innerHTML = `<div class="wrap"><p>This order is not confirmed yet (status: ${order.paymentStatus}). If you completed payment and see this, contact support with order ID ${order.id}.</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="wrap confirm-wrap">
        <div class="confirm-box">
          <div class="confirm-emoji">🌷</div>
          <h1>Your order is confirmed!</h1>
          <p class="confirm-sub">Thank you for choosing Tendril & Twine.</p>
          <div class="confirm-id">Order #${order.id}</div>

          <table class="pd-specs">
            <tr><td>Payment</td><td class="stock-yes">Paid</td></tr>
            <tr><td>Order date</td><td>${new Date(order.createdAt).toLocaleString('en-IN')}</td></tr>
            <tr><td>Name</td><td>${order.customer.name}</td></tr>
            <tr><td>Delivery address</td><td>${order.address.line1}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}</td></tr>
            ${order.appliedCoupon ? `<tr><td>Coupon used</td><td>${order.appliedCoupon.code}</td></tr>` : ""}
            ${order.freebie ? `<tr><td>Free gift</td><td>${order.freebie.name}</td></tr>` : ""}
            <tr><td>Amount paid</td><td><strong>${money(order.total)}</strong></td></tr>
          </table>

          <a href="#home" class="btn btn-primary" style="margin-top:24px;">Continue shopping</a>
        </div>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="wrap"><p>Could not load order details.</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
