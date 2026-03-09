// ═══════════════════════════════════════════════
//  LIUS PROS — app.js
//  Shared config, Supabase client, utilities
// ═══════════════════════════════════════════════

// ── CONFIG ──────────────────────────────────────
// 🔧 Replace with your actual keys before deploying
const SUPABASE_URL  = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_KEY';
const PAYSTACK_KEY  = 'pk_test_YOUR_PAYSTACK_PUBLIC_KEY';

// EmailJS config
const EMAILJS_SERVICE  = 'YOUR_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE = 'YOUR_EMAILJS_TEMPLATE_ID';
const EMAILJS_USER     = 'YOUR_EMAILJS_PUBLIC_KEY';

// ── SUPABASE CLIENT ──────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── PRODUCT ICONS MAP ───────────────────────────
const ICONS = {
  'netflix': '🎬',
  'spotify': '🎵',
  'youtube': '▶️',
  'youtube premium': '▶️',
  'amazon': '📦',
  'prime': '📦',
  'disney': '🏰',
  'hulu': '📺',
  'apple': '🍎',
  'canva': '🎨',
  'deezer': '🎶',
  'default': '⭐'
};

function getIcon(name) {
  const lower = (name || '').toLowerCase();
  for (const key in ICONS) {
    if (lower.includes(key)) return ICONS[key];
  }
  return ICONS.default;
}

// ── TOAST ────────────────────────────────────────
function toast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── FORMAT CURRENCY ──────────────────────────────
function formatPrice(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG');
}

// ── SLOT COUNT BADGE ─────────────────────────────
function slotBadge(count) {
  if (count === 0) {
    return `<span class="slot-badge soldout">❌ Sold Out</span>`;
  } else if (count <= 3) {
    return `<span class="slot-badge low">🔥 Only ${count} Slot${count > 1 ? 's' : ''} Left</span>`;
  }
  return `<span class="slot-badge available">✅ ${count} Slots Available</span>`;
}

// ── FETCH PRODUCTS WITH SLOT COUNT ──────────────
async function fetchProducts() {
  const { data: products, error } = await db.from('products').select('*').order('created_at', { ascending: true });
  if (error) throw error;

  // Count available slots per product
  const productIds = products.map(p => p.id);
  const { data: slots } = await db
    .from('slots')
    .select('product_id')
    .eq('status', 'available')
    .in('product_id', productIds);

  const slotCounts = {};
  (slots || []).forEach(s => {
    slotCounts[s.product_id] = (slotCounts[s.product_id] || 0) + 1;
  });

  return products.map(p => ({
    ...p,
    availableSlots: slotCounts[p.id] || 0
  }));
}

// ── ASSIGN SLOT ──────────────────────────────────
async function assignSlot(productId) {
  const { data, error } = await db
    .from('slots')
    .select('*')
    .eq('product_id', productId)
    .eq('status', 'available')
    .limit(1)
    .single();

  if (error || !data) throw new Error('No available slots for this product.');

  const { error: updateError } = await db
    .from('slots')
    .update({ status: 'used' })
    .eq('id', data.id);

  if (updateError) throw updateError;
  return data;
}

// ── INSERT ORDER ─────────────────────────────────
async function insertOrder({ customerEmail, whatsapp, productId, slotId, paymentReference }) {
  const { data, error } = await db.from('orders').insert([{
    customer_email: customerEmail,
    whatsapp,
    product_id: productId,
    slot_id: slotId,
    payment_reference: paymentReference,
    status: 'completed'
  }]).select().single();

  if (error) throw error;
  return data;
}

// ── SEND EMAIL (EmailJS) ─────────────────────────
async function sendCredentialEmail({ toEmail, productName, loginEmail, loginPassword, profileName }) {
  if (typeof emailjs === 'undefined') return;
  emailjs.init(EMAILJS_USER);
  await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
    to_email: toEmail,
    product_name: productName,
    login_email: loginEmail,
    login_password: loginPassword,
    profile_name: profileName
  });
}

// ── PAYSTACK PAYMENT ─────────────────────────────
function initiatePaystack({ email, amount, onSuccess, onClose }) {
  const handler = PaystackPop.setup({
    key: PAYSTACK_KEY,
    email,
    amount: amount * 100, // convert to kobo
    currency: 'NGN',
    callback: function(response) {
      onSuccess(response.reference);
    },
    onClose: function() {
      if (onClose) onClose();
    }
  });
  handler.openIframe();
}

// ── STORE PENDING ORDER IN SESSION ───────────────
function savePending(data) {
  sessionStorage.setItem('lius_pending', JSON.stringify(data));
}

function loadPending() {
  const d = sessionStorage.getItem('lius_pending');
  return d ? JSON.parse(d) : null;
}

function clearPending() {
  sessionStorage.removeItem('lius_pending');
}

// ── SAVE SUCCESS DATA ─────────────────────────────
function saveSuccess(data) {
  sessionStorage.setItem('lius_success', JSON.stringify(data));
}

function loadSuccess() {
  const d = sessionStorage.getItem('lius_success');
  return d ? JSON.parse(d) : null;
}

// ── RENDER PRODUCT CARD ──────────────────────────
function renderProductCard(product, linkTo = 'checkout.html') {
  const { id, name, price, availableSlots } = product;
  const soldOut = availableSlots === 0;
  const icon = getIcon(name);

  return `
    <div class="product-card">
      <div class="product-icon">${icon}</div>
      <div class="product-name">${name}</div>
      <div class="product-price">${formatPrice(price)} <span>/ month</span></div>
      ${slotBadge(availableSlots)}
      <a 
        href="${linkTo}?id=${id}"
        class="btn btn-primary btn-full${soldOut ? ' disabled' : ''}"
        ${soldOut ? 'onclick="return false" style="pointer-events:none"' : ''}
      >
        ${soldOut ? 'Sold Out' : 'Subscribe Now →'}
      </a>
    </div>
  `;
}

// ── COPY TEXT UTILITY ─────────────────────────────
function copyText(text, label = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => toast(label, 'success'));
}
