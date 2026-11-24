<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'New product · Kola' })
</script>

<template>
  <AdminProductEditor @saved="navigateTo(`/admin/products/${$event}`, { replace: true })" />
</template>
