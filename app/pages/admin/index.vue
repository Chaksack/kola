<script setup lang="ts">
definePageMeta({ middleware: 'admin-auth' })
await navigateTo('/admin/orders', { replace: true })
</script>

<template>
  <div />
</template>
