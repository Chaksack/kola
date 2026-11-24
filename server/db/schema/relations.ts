import { relations } from 'drizzle-orm'
import { region, regionCountry, regionPaymentProvider, taxRate } from './region'
import { apiKey, apiKeySalesChannel, salesChannel } from './sales-channel'
import {
  product,
  productCategory,
  productCategoryProduct,
  productCollection,
  productImage,
  productOption,
  productOptionValue,
  productSalesChannel,
  productTag,
  productTagLink,
  productType,
  productVariant,
  variantOptionValue,
} from './catalog'
import { price, priceList, priceListCustomerGroup, priceSet } from './pricing'
import { inventoryItem, inventoryLevel, reservation, stockLocation } from './inventory'
import {
  fulfillment,
  fulfillmentItem,
  fulfillmentTracking,
  serviceZone,
  serviceZoneCountry,
  shippingOption,
  shippingOptionPrice,
  shippingProfile,
} from './fulfillment'
import { customer, customerAddress, customerGroup, customerGroupMember } from './customer'
import { cart, cartLineItem, cartPromotion, cartShippingMethod } from './cart'
import { payment, paymentCollection, paymentSession } from './payment'
import {
  exchange,
  exchangeItem,
  order,
  orderChange,
  orderEvent,
  orderItem,
  orderReturn,
  orderShippingMethod,
  orderTransaction,
  refund,
  returnItem,
} from './order'
import { campaign, promotion, promotionRule } from './promotion'
import { webhookDelivery, webhookEndpoint } from './platform'

export const regionRelations = relations(region, ({ many }) => ({
  countries: many(regionCountry),
  paymentProviders: many(regionPaymentProvider),
  taxRates: many(taxRate),
}))
export const regionCountryRelations = relations(regionCountry, ({ one }) => ({
  region: one(region, { fields: [regionCountry.regionId], references: [region.id] }),
}))
export const regionPaymentProviderRelations = relations(regionPaymentProvider, ({ one }) => ({
  region: one(region, { fields: [regionPaymentProvider.regionId], references: [region.id] }),
}))
export const taxRateRelations = relations(taxRate, ({ one }) => ({
  region: one(region, { fields: [taxRate.regionId], references: [region.id] }),
}))

export const salesChannelRelations = relations(salesChannel, ({ many }) => ({
  apiKeys: many(apiKeySalesChannel),
  products: many(productSalesChannel),
}))
export const apiKeyRelations = relations(apiKey, ({ many }) => ({
  salesChannels: many(apiKeySalesChannel),
}))
export const apiKeySalesChannelRelations = relations(apiKeySalesChannel, ({ one }) => ({
  apiKey: one(apiKey, { fields: [apiKeySalesChannel.apiKeyId], references: [apiKey.id] }),
  salesChannel: one(salesChannel, { fields: [apiKeySalesChannel.salesChannelId], references: [salesChannel.id] }),
}))

export const productRelations = relations(product, ({ one, many }) => ({
  variants: many(productVariant),
  options: many(productOption),
  images: many(productImage),
  collection: one(productCollection, { fields: [product.collectionId], references: [productCollection.id] }),
  type: one(productType, { fields: [product.typeId], references: [productType.id] }),
  tags: many(productTagLink),
  categories: many(productCategoryProduct),
  salesChannels: many(productSalesChannel),
}))
export const productOptionRelations = relations(productOption, ({ one, many }) => ({
  product: one(product, { fields: [productOption.productId], references: [product.id] }),
  values: many(productOptionValue),
}))
export const productOptionValueRelations = relations(productOptionValue, ({ one, many }) => ({
  option: one(productOption, { fields: [productOptionValue.optionId], references: [productOption.id] }),
  variants: many(variantOptionValue),
}))
export const productVariantRelations = relations(productVariant, ({ one, many }) => ({
  product: one(product, { fields: [productVariant.productId], references: [product.id] }),
  optionValues: many(variantOptionValue),
  priceSet: one(priceSet, { fields: [productVariant.id], references: [priceSet.variantId] }),
  inventoryItem: one(inventoryItem, { fields: [productVariant.id], references: [inventoryItem.variantId] }),
}))
export const variantOptionValueRelations = relations(variantOptionValue, ({ one }) => ({
  variant: one(productVariant, { fields: [variantOptionValue.variantId], references: [productVariant.id] }),
  optionValue: one(productOptionValue, { fields: [variantOptionValue.optionValueId], references: [productOptionValue.id] }),
}))
export const productImageRelations = relations(productImage, ({ one }) => ({
  product: one(product, { fields: [productImage.productId], references: [product.id] }),
}))
export const productCollectionRelations = relations(productCollection, ({ many }) => ({
  products: many(product),
}))
export const productCategoryRelations = relations(productCategory, ({ one, many }) => ({
  parent: one(productCategory, { fields: [productCategory.parentId], references: [productCategory.id], relationName: 'category_tree' }),
  children: many(productCategory, { relationName: 'category_tree' }),
  products: many(productCategoryProduct),
}))
export const productCategoryProductRelations = relations(productCategoryProduct, ({ one }) => ({
  category: one(productCategory, { fields: [productCategoryProduct.categoryId], references: [productCategory.id] }),
  product: one(product, { fields: [productCategoryProduct.productId], references: [product.id] }),
}))
export const productTagRelations = relations(productTag, ({ many }) => ({
  products: many(productTagLink),
}))
export const productTagLinkRelations = relations(productTagLink, ({ one }) => ({
  product: one(product, { fields: [productTagLink.productId], references: [product.id] }),
  tag: one(productTag, { fields: [productTagLink.tagId], references: [productTag.id] }),
}))
export const productTypeRelations = relations(productType, ({ many }) => ({
  products: many(product),
}))
export const productSalesChannelRelations = relations(productSalesChannel, ({ one }) => ({
  product: one(product, { fields: [productSalesChannel.productId], references: [product.id] }),
  salesChannel: one(salesChannel, { fields: [productSalesChannel.salesChannelId], references: [salesChannel.id] }),
}))

export const priceSetRelations = relations(priceSet, ({ one, many }) => ({
  variant: one(productVariant, { fields: [priceSet.variantId], references: [productVariant.id] }),
  prices: many(price),
}))
export const priceRelations = relations(price, ({ one }) => ({
  priceSet: one(priceSet, { fields: [price.priceSetId], references: [priceSet.id] }),
  priceList: one(priceList, { fields: [price.priceListId], references: [priceList.id] }),
}))
export const priceListRelations = relations(priceList, ({ many }) => ({
  prices: many(price),
  customerGroups: many(priceListCustomerGroup),
}))
export const priceListCustomerGroupRelations = relations(priceListCustomerGroup, ({ one }) => ({
  priceList: one(priceList, { fields: [priceListCustomerGroup.priceListId], references: [priceList.id] }),
}))

export const stockLocationRelations = relations(stockLocation, ({ many }) => ({
  levels: many(inventoryLevel),
  serviceZones: many(serviceZone),
}))
export const inventoryItemRelations = relations(inventoryItem, ({ one, many }) => ({
  variant: one(productVariant, { fields: [inventoryItem.variantId], references: [productVariant.id] }),
  levels: many(inventoryLevel),
  reservations: many(reservation),
}))
export const inventoryLevelRelations = relations(inventoryLevel, ({ one }) => ({
  item: one(inventoryItem, { fields: [inventoryLevel.inventoryItemId], references: [inventoryItem.id] }),
  location: one(stockLocation, { fields: [inventoryLevel.locationId], references: [stockLocation.id] }),
}))
export const reservationRelations = relations(reservation, ({ one }) => ({
  item: one(inventoryItem, { fields: [reservation.inventoryItemId], references: [inventoryItem.id] }),
  location: one(stockLocation, { fields: [reservation.locationId], references: [stockLocation.id] }),
}))

export const shippingProfileRelations = relations(shippingProfile, ({ many }) => ({
  options: many(shippingOption),
}))
export const serviceZoneRelations = relations(serviceZone, ({ one, many }) => ({
  location: one(stockLocation, { fields: [serviceZone.locationId], references: [stockLocation.id] }),
  countries: many(serviceZoneCountry),
  options: many(shippingOption),
}))
export const serviceZoneCountryRelations = relations(serviceZoneCountry, ({ one }) => ({
  zone: one(serviceZone, { fields: [serviceZoneCountry.serviceZoneId], references: [serviceZone.id] }),
}))
export const shippingOptionRelations = relations(shippingOption, ({ one, many }) => ({
  zone: one(serviceZone, { fields: [shippingOption.serviceZoneId], references: [serviceZone.id] }),
  profile: one(shippingProfile, { fields: [shippingOption.shippingProfileId], references: [shippingProfile.id] }),
  prices: many(shippingOptionPrice),
}))
export const shippingOptionPriceRelations = relations(shippingOptionPrice, ({ one }) => ({
  option: one(shippingOption, { fields: [shippingOptionPrice.shippingOptionId], references: [shippingOption.id] }),
}))
export const fulfillmentRelations = relations(fulfillment, ({ one, many }) => ({
  order: one(order, { fields: [fulfillment.orderId], references: [order.id] }),
  location: one(stockLocation, { fields: [fulfillment.locationId], references: [stockLocation.id] }),
  items: many(fulfillmentItem),
  tracking: many(fulfillmentTracking),
}))
export const fulfillmentItemRelations = relations(fulfillmentItem, ({ one }) => ({
  fulfillment: one(fulfillment, { fields: [fulfillmentItem.fulfillmentId], references: [fulfillment.id] }),
}))
export const fulfillmentTrackingRelations = relations(fulfillmentTracking, ({ one }) => ({
  fulfillment: one(fulfillment, { fields: [fulfillmentTracking.fulfillmentId], references: [fulfillment.id] }),
}))

export const customerRelations = relations(customer, ({ many }) => ({
  addresses: many(customerAddress),
  groups: many(customerGroupMember),
  orders: many(order),
}))
export const customerAddressRelations = relations(customerAddress, ({ one }) => ({
  customer: one(customer, { fields: [customerAddress.customerId], references: [customer.id] }),
}))
export const customerGroupRelations = relations(customerGroup, ({ many }) => ({
  members: many(customerGroupMember),
}))
export const customerGroupMemberRelations = relations(customerGroupMember, ({ one }) => ({
  customer: one(customer, { fields: [customerGroupMember.customerId], references: [customer.id] }),
  group: one(customerGroup, { fields: [customerGroupMember.groupId], references: [customerGroup.id] }),
}))

export const cartRelations = relations(cart, ({ one, many }) => ({
  items: many(cartLineItem),
  shippingMethods: many(cartShippingMethod),
  promotions: many(cartPromotion),
  region: one(region, { fields: [cart.regionId], references: [region.id] }),
  customer: one(customer, { fields: [cart.customerId], references: [customer.id] }),
}))
export const cartLineItemRelations = relations(cartLineItem, ({ one }) => ({
  cart: one(cart, { fields: [cartLineItem.cartId], references: [cart.id] }),
}))
export const cartShippingMethodRelations = relations(cartShippingMethod, ({ one }) => ({
  cart: one(cart, { fields: [cartShippingMethod.cartId], references: [cart.id] }),
}))
export const cartPromotionRelations = relations(cartPromotion, ({ one }) => ({
  cart: one(cart, { fields: [cartPromotion.cartId], references: [cart.id] }),
  promotion: one(promotion, { fields: [cartPromotion.promotionId], references: [promotion.id] }),
}))

export const paymentCollectionRelations = relations(paymentCollection, ({ many }) => ({
  sessions: many(paymentSession),
  payments: many(payment),
}))
export const paymentSessionRelations = relations(paymentSession, ({ one }) => ({
  collection: one(paymentCollection, { fields: [paymentSession.paymentCollectionId], references: [paymentCollection.id] }),
}))
export const paymentRelations = relations(payment, ({ one }) => ({
  collection: one(paymentCollection, { fields: [payment.paymentCollectionId], references: [paymentCollection.id] }),
}))

export const orderRelations = relations(order, ({ one, many }) => ({
  items: many(orderItem),
  shippingMethods: many(orderShippingMethod),
  transactions: many(orderTransaction),
  events: many(orderEvent),
  changes: many(orderChange),
  fulfillments: many(fulfillment),
  returns: many(orderReturn),
  exchanges: many(exchange),
  refunds: many(refund),
  customer: one(customer, { fields: [order.customerId], references: [customer.id] }),
  region: one(region, { fields: [order.regionId], references: [region.id] }),
  salesChannel: one(salesChannel, { fields: [order.salesChannelId], references: [salesChannel.id] }),
}))
export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
}))
export const orderShippingMethodRelations = relations(orderShippingMethod, ({ one }) => ({
  order: one(order, { fields: [orderShippingMethod.orderId], references: [order.id] }),
}))
export const orderTransactionRelations = relations(orderTransaction, ({ one }) => ({
  order: one(order, { fields: [orderTransaction.orderId], references: [order.id] }),
}))
export const orderEventRelations = relations(orderEvent, ({ one }) => ({
  order: one(order, { fields: [orderEvent.orderId], references: [order.id] }),
}))
export const orderChangeRelations = relations(orderChange, ({ one }) => ({
  order: one(order, { fields: [orderChange.orderId], references: [order.id] }),
}))
export const orderReturnRelations = relations(orderReturn, ({ one, many }) => ({
  order: one(order, { fields: [orderReturn.orderId], references: [order.id] }),
  items: many(returnItem),
}))
export const returnItemRelations = relations(returnItem, ({ one }) => ({
  return: one(orderReturn, { fields: [returnItem.returnId], references: [orderReturn.id] }),
}))
export const exchangeRelations = relations(exchange, ({ one, many }) => ({
  order: one(order, { fields: [exchange.orderId], references: [order.id] }),
  items: many(exchangeItem),
}))
export const exchangeItemRelations = relations(exchangeItem, ({ one }) => ({
  exchange: one(exchange, { fields: [exchangeItem.exchangeId], references: [exchange.id] }),
}))
export const refundRelations = relations(refund, ({ one }) => ({
  order: one(order, { fields: [refund.orderId], references: [order.id] }),
}))

export const campaignRelations = relations(campaign, ({ many }) => ({
  promotions: many(promotion),
}))
export const promotionRelations = relations(promotion, ({ one, many }) => ({
  campaign: one(campaign, { fields: [promotion.campaignId], references: [campaign.id] }),
  rules: many(promotionRule),
}))
export const promotionRuleRelations = relations(promotionRule, ({ one }) => ({
  promotion: one(promotion, { fields: [promotionRule.promotionId], references: [promotion.id] }),
}))

export const webhookEndpointRelations = relations(webhookEndpoint, ({ many }) => ({
  deliveries: many(webhookDelivery),
}))
export const webhookDeliveryRelations = relations(webhookDelivery, ({ one }) => ({
  endpoint: one(webhookEndpoint, { fields: [webhookDelivery.endpointId], references: [webhookEndpoint.id] }),
}))
