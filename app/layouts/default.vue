<template>
  <div class="site">
    <a href="#main" class="skip-link">Skip to content</a>
    <StoreSiteHeader />
    <main id="main" class="site-main">
      <slot />
    </main>
    <StoreSiteFooter />
    <StoreCartDrawer />
  </div>
</template>

<style scoped>
.site {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
}
.site-main {
  flex: 1;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 clamp(16px, 3vw, 40px);
}
.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  left: 12px;
  top: 12px;
  z-index: 100;
  background: var(--paper);
  padding: 8px 12px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}
</style>
