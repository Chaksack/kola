<template>
  <div class="admin-shell">
    <a href="#admin-main" class="skip-link">Skip to content</a>
    <AdminSidebar />
    <main id="admin-main" class="admin-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  flex-wrap: wrap;
  min-height: 100vh;
  background: var(--paper);
}
.admin-content {
  flex: 999 1 560px;
  min-width: 0;
  padding: 20px clamp(16px, 3vw, 40px) 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
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
