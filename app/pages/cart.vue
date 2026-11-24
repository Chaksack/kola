<script setup lang="ts">
useSeoMeta({ title: 'Cart · Kola Market', robots: 'noindex' })
const cartStore = useCartStore()
const code = ref('')
const codeError = ref('')
const loaded = ref(false)
onMounted(async () => {
  await cartStore.load()
  loaded.value = true
})

async function applyCode() {
  codeError.value = ''
  if (!code.value.trim()) return
  try {
    await cartStore.applyCode(code.value.trim())
    code.value = ''
  } catch (err) {
    codeError.value = apiErrorMessage(err, "That code didn't work")
  }
}
</script>

<template>
  <div class="cart-page">
    <h1 class="section-heading">Cart</h1>
    <p v-if="cartStore.notice" class="notice" role="status">{{ cartStore.notice }}</p>

    <div v-if="!loaded" class="meta">Loading your cart…</div>
    <div v-else-if="!cartStore.count" class="empty">
      <p class="lead heading-second">Your cart is empty.</p>
      <UiButton variant="primary" to="/shop">Shop now</UiButton>
    </div>
    <div v-else class="cart-grid">
      <section aria-label="Items">
        <p v-if="cartStore.error" class="text-danger" role="alert">{{ cartStore.error }}</p>
        <StoreCartLines />
      </section>
      <aside class="summary" aria-label="Order summary">
        <h2 class="lead">Summary</h2>
        <form class="promo" @submit.prevent="applyCode">
          <UiInput v-model="code" label="Promo code" placeholder="HARMATTAN10" mono :error="codeError || undefined" />
          <UiButton type="submit" :loading="cartStore.busy">Apply</UiButton>
        </form>
        <ul v-if="cartStore.cart?.promotions.length" class="codes">
          <li v-for="p in cartStore.cart.promotions" :key="p.code">
            <span class="mono">{{ p.code }}</span>
            <button v-if="!p.isAutomatic" type="button" class="link-btn" :aria-label="`Remove code ${p.code}`" @click="cartStore.removeCode(p.code)">Remove</button>
          </li>
        </ul>
        <StoreCartTotals show-shipping />
        <UiButton variant="primary" block to="/checkout">Checkout</UiButton>
        <p class="meta">Taxes are included for Ghana, UK and EU orders. Shipping is chosen at checkout.</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.cart-page {
  padding-top: 40px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.empty {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
  padding: 24px 0 48px;
}
.notice {
  padding: 10px 14px;
  background: var(--putty-inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  font-size: var(--fs-ui);
}
.cart-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
  gap: 40px;
  align-items: start;
}
.summary {
  background: var(--putty);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 84px;
}
.promo {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: end;
}
.codes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--fs-ui);
}
.codes li {
  display: flex;
  justify-content: space-between;
}
.link-btn {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: var(--fs-meta);
  color: var(--ink-3);
  text-decoration: underline;
  cursor: pointer;
}
@media (max-width: 860px) {
  .cart-grid {
    grid-template-columns: 1fr;
  }
  .summary {
    position: static;
  }
}
</style>
