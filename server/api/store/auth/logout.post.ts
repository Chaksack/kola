export default defineApiHandler(async (event) => {
  await setSessionActor(event, 'customer', null)
  return { ok: true }
})
