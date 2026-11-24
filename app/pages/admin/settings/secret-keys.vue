<script setup lang="ts">
definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Secret API keys · Settings' })
</script>

<template>
  <AdminApiKeys type="secret" />
</template>
