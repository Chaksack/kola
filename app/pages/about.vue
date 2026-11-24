<script setup lang="ts">
useSeoMeta({ title: 'About · Kola Market', description: 'Kola Market buys directly from Ghanaian makers and ships from Tema.' })
</script>

<template>
  <article class="about">
    <header class="about__head">
      <p class="eyebrow">About</p>
      <h1 class="display">
        Kola Market
        <span class="heading-second">since 2019.</span>
      </h1>
    </header>
    <section id="makers" class="about__section">
      <h2 class="lead">Our makers</h2>
      <p>We work with twelve workshops and cooperatives: kente weavers in Bonwire, potters in Vume, basket weavers in Bolgatanga, batik artists in Aburi and shea cooperatives around Tamale. We pay on delivery to our warehouse and publish who made what.</p>
    </section>
    <section id="delivery" class="about__section">
      <h2 class="lead">Delivery</h2>
      <p>Orders ship from our Tema warehouse. Standard delivery in Ghana takes 2–4 working days; express in Accra and Tema arrives same or next day; or pick up from our Osu store. International orders ship with DHL in 7–12 working days.</p>
    </section>
    <section id="returns" class="about__section">
      <h2 class="lead">Returns</h2>
      <p>Return unworn, unused items within 30 days for a refund to your original payment method. Gift cards and pantry items can't be returned.</p>
    </section>
    <section id="contact" class="about__section">
      <h2 class="lead">Contact</h2>
      <p>14 Oxford Street, Osu, Accra · hello@kola.market · +233 30 200 0222</p>
    </section>
    <section id="terms" class="about__section">
      <h2 class="lead">Terms</h2>
      <p>Prices include VAT where shown. Orders are confirmed once payment is authorised or, for cash on delivery, once we've called to confirm.</p>
    </section>
    <section id="privacy" class="about__section">
      <h2 class="lead">Privacy</h2>
      <p>We store your name, contact details and order history to fulfil orders. Card details are handled by Paystack or Stripe and never reach our servers.</p>
    </section>
  </article>
</template>

<style scoped>
.about {
  max-width: 760px;
  padding: 56px 0 0;
  display: flex;
  flex-direction: column;
  gap: 40px;
}
.about__head {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.about__head .display {
  display: flex;
  flex-direction: column;
}
.about__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 24px;
  border-top: 1px solid var(--rule);
}
.about__section p {
  color: var(--ink-2);
}
@media (max-width: 860px) {
  .display {
    font-size: 44px;
  }
}
</style>
