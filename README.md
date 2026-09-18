# Tendril & Twine — Real Ecommerce Store

This is a genuine full-stack build: a backend that creates real Razorpay
orders and verifies payments server-side, and a frontend that is the
**only** place orders get created. WhatsApp/Instagram are support-only —
there is no "Order on WhatsApp" anywhere in the code.

**What's real vs. what you still need to add:**
- ✅ Real order creation, real Razorpay Orders API calls, real HMAC-SHA256
  payment signature verification, real coupon/pricing logic — all
  tested and working in this build.
- ⏳ Not yet real: your actual Razorpay account (you need to sign up +
  complete KYC), a live server to host the backend, and real product
  photos. Sections below tell you exactly what to do for each.

---

## 1. Project structure

```
tendril-twine-store/
├── backend/                 ← Node/Express API + order storage
│   ├── server.js            ← entry point
│   ├── config.js            ← brand name, WhatsApp/care numbers, delivery charge
│   ├── pricing.js           ← recalculates totals server-side (never trusts the browser)
│   ├── db.js                ← order storage (simple JSON file — swap for a real DB later)
│   ├── data/
│   │   ├── products.json    ← EDIT THIS to add/change products
│   │   ├── coupons.json     ← EDIT THIS to add/change coupons
│   │   ├── freebies.json    ← EDIT THIS to add/change freebies
│   │   └── orders.json      ← where orders are actually stored (auto-created)
│   ├── routes/               ← products, freebies, coupons, orders, webhook, admin
│   └── .env.example          ← copy to .env and fill in your real values
│
└── frontend/                 ← static site, deploy anywhere (Netlify/Vercel/GitHub Pages)
    ├── index.html             ← home / product detail / cart / checkout / confirmation (all one SPA)
    ├── admin.html             ← simple order list + status updates (needs your admin token)
    ├── js/config.js           ← EDIT THIS: your backend URL, WhatsApp number, Instagram handle
    ├── js/app.js               ← all cart/checkout/payment logic
    ├── css/styles.css
    ├── images/products/…       ← placeholder images — replace with real photos, same filenames
    └── pages/                  ← privacy, terms, shipping, refund, care guide
```

---

## 2. Running it locally (test mode)

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# open .env and fill in:
#   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET   → from your Razorpay TEST mode dashboard
#   ADMIN_TOKEN                              → any long random string
#   ALLOWED_ORIGINS                          → http://localhost:5500 (or wherever you serve the frontend)
npm start
```
You should see `🌷 Tendril & Twine backend running on http://localhost:4000`.

**Frontend:** open `frontend/js/config.js` and confirm `API_BASE_URL` points
at `http://localhost:4000`, then serve the folder (don't just double-click
the HTML file, or the API calls will be blocked):
```bash
cd frontend
python3 -m http.server 5500
```
Visit `http://localhost:5500`.

---

## 3. Getting Razorpay TEST keys (takes 5 minutes, no KYC needed yet)

1. Sign up at dashboard.razorpay.com
2. Toggle to **Test Mode** (top left)
3. Settings → API Keys → Generate Test Key
4. Paste the Key ID and Key Secret into `backend/.env`
5. Use Razorpay's published test card/UPI numbers (in their docs) to test
   full payment flows — success, failure, and cancellation — without any
   real money moving.

---

## 4. Going LIVE — exactly what you need to provide

I cannot make this live for you from here — a real payment gateway needs
your own merchant account. Here's the checklist:

1. **Complete Razorpay KYC** (PAN, bank account, business proof) — this is
   what unlocks Live Mode on your Razorpay account.
2. **Get your Live keys** (they start with `rzp_live_...`) and put them in
   your production `.env` — never in frontend code.
3. **Host the backend somewhere with HTTPS** — Render, Railway, or Fly.io
   all have free/cheap tiers that work well for this. Vercel/Netlify are
   fine for the *frontend* but not for this Express backend as-is.
4. **Host the frontend** — Netlify, Vercel, or GitHub Pages all work since
   it's a static site.
5. **Update `frontend/js/config.js`** → `API_BASE_URL` to your live
   backend URL, and **`backend/.env`** → `ALLOWED_ORIGINS` to your live
   frontend URL.
6. **(Recommended) Set up the webhook**: Razorpay Dashboard → Settings →
   Webhooks → add `https://your-backend-url/api/webhook/razorpay`,
   subscribe to `payment.captured` and `payment.failed`, copy the webhook
   secret into `.env` as `RAZORPAY_WEBHOOK_SECRET`. This protects you if a
   customer closes their browser right after paying.
7. **Swap the order storage** — the current `orders.json` file works fine
   for testing and even a small launch, but move to a real database
   (Postgres via Render/Supabase is easiest) once order volume grows.
   Only `backend/db.js` needs to change — nothing else in the app touches
   storage directly.

---

## 5. How each system works

**Cart** — stored in the browser's `localStorage`, so it survives a
refresh. Nothing about pricing is trusted from here; it's just for display.

**Coupons** — `backend/data/coupons.json`. Add a coupon by adding an
object with `code`, `type` (`"percent"` or `"flat"`), `value`,
`maxDiscountInr`, `minOrderValueInr`, `active`, `firstOrderOnly`. The
backend re-validates every coupon on every request — a customer can't
apply an expired or fake code no matter what the frontend sends.

**Freebies** — `backend/data/freebies.json`. Set `"available": false` to
retire one without deleting it. The selected freebie is always priced
`"FREE"` and is never added to the payable total.

**Prepaid checkout** — there is no COD code path anywhere in the app. The
only way to complete checkout is through Razorpay.

**Razorpay Test Mode** — already wired up; just needs your test keys in
`.env`. Nothing else changes when you move to Live Mode except swapping
`rzp_test_...` for `rzp_live_...`.

**Payment verification** — `backend/routes/orders.js` → `/api/orders/verify`.
The frontend's "payment succeeded" callback is never trusted by itself;
the backend recomputes the HMAC-SHA256 signature from the order ID +
payment ID using your secret key, and only marks the order `paid` if it
matches exactly. This is the same check Razorpay's own docs require.

**Order storage** — `backend/data/orders.json`, one entry per order, with
internal ID, Razorpay IDs, full item/pricing/customer/address snapshot,
and payment/order status. No card numbers, CVVs, or UPI PINs are ever
stored — Razorpay handles those directly.

---

## 6. Where to change things (quick reference)

| What | File |
|---|---|
| WhatsApp support number | `frontend/js/config.js` → `WHATSAPP_SUPPORT_NUMBER` (and `backend/config.js` → `brand.whatsappSupportNumber`) |
| Customer care number | `backend/config.js` → `brand.customerCareNumber`, then update `frontend/index.html` footer |
| Instagram handle | `frontend/js/config.js` → `INSTAGRAM_HANDLE` / `INSTAGRAM_URL` |
| Product images | `frontend/images/products/` — replace the placeholder files, keeping the same filenames referenced in `backend/data/products.json` |
| Add/remove freebies | `backend/data/freebies.json` |
| Add/change coupons | `backend/data/coupons.json` |
| Delivery charge / free-delivery threshold | `backend/.env` → `DELIVERY_CHARGE_INR`, `FREE_DELIVERY_ABOVE_INR` |
| Where orders live | `backend/data/orders.json` (swap for a real DB when ready — see §4.7) |
| See/manage orders | Open `frontend/admin.html`, paste your `ADMIN_TOKEN` from `.env` |

---

## 7. Testing checklist before you launch

- [ ] Add a product to cart, adjust quantity, remove an item
- [ ] Apply `WELCOME10`, confirm the discount and total update correctly
- [ ] Try an invalid coupon code — confirm it's rejected with a clear message
- [ ] Select a freebie, confirm it shows as FREE and isn't added to the total
- [ ] Submit checkout with an invalid pincode/mobile — confirm it's blocked
- [ ] Complete a Razorpay **test** payment — confirm the order becomes "Paid" only after verification
- [ ] Cancel a Razorpay payment mid-flow — confirm the order is NOT marked paid
- [ ] Check `frontend/admin.html` shows the order with correct details
- [ ] Test on mobile — no horizontal scroll, checkout is easy to fill on a small screen
