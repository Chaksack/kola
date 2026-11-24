<script setup lang="ts">
definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Publishable API keys · Settings' })
</script>

<template>
  <AdminApiKeys type="publishable" />
</template>
