export default defineApiHandler(async (event) => {
  const actor = await requireAdmin(event)
  return { actor }
})
