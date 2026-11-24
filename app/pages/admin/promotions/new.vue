<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'New promotion · Kola' })
</script>

<template>
  <AdminPromotionEditor @saved="navigateTo(`/admin/promotions/${$event}`, { replace: true })" />
</template>
