<script setup lang="ts">
const cartStore = useCartStore()
const open = computed({ get: () => cartStore.drawerOpen, set: (v) => (cartStore.drawerOpen = v) })
const route = useRoute()
watch(() => route.fullPath, () => (cartStore.drawerOpen = false))
</script>

<template>
  <UiDrawer v-model:open="open" :title="`Cart · ${cartStore.count}`">
    <div class="stack" style="--stack-gap: 16px">
      <p v-if="cartStore.error" class="text-danger" role="alert">{{ cartStore.error }}</p>
      <StoreCartLines v-if="cartStore.count" compact />
      <div v-else class="empty">
        <p>Your cart is empty.</p>
        <UiButton variant="secondary" to="/shop" @click="open = false">Browse the shop</UiButton>
      </div>
      <StoreCartTotals v-if="cartStore.count" />
    </div>
    <template v-if="cartStore.count" #footer>
      <div class="foot">
        <UiButton to="/cart" block>View cart</UiButton>
        <UiButton variant="primary" to="/checkout" block>Checkout</UiButton>
      </div>
    </template>
  </UiDrawer>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  padding: 24px 0;
}
.foot {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  width: 100%;
}
</style>
