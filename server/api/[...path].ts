// Unknown /api routes return the standard error shape instead of an HTML page.
export default defineApiHandler(() => {
  throw apiError(404, 'not_found', 'No such API route')
})
