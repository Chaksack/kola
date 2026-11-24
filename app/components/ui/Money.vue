<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'

defineProps<{ amount: number | null | undefined; currency: string }>()
</script>

<template>
  <span class="num">{{ amount == null ? '—' : formatMoney(amount, currency) }}</span>
</template>
