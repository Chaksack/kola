<script setup lang="ts">
definePageMeta({ middleware: 'admin-auth' })
await navigateTo('/admin/settings/store', { replace: true })
</script>

<template>
  <div />
</template>
