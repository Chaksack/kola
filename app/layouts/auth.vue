<template>
  <div class="auth-shell">
    <div class="auth-brand">
      <span class="auth-mark" aria-hidden="true">K</span>
      <span>Kola Commerce</span>
    </div>
    <main class="auth-card">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px 16px;
}
.auth-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--fs-ui);
  font-weight: 500;
}
.auth-mark {
  width: 28px;
  height: 28px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--paper);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.auth-card {
  width: min(400px, 100%);
  background: var(--putty);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
