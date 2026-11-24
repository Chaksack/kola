export default defineApiHandler(async (event) => {
  await setSessionActor(event, 'admin', null)
  return { ok: true }
})
