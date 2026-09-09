const { AsyncLocalStorage } = require("node:async_hooks");
const context = new AsyncLocalStorage();
function businessNow() {
  const date = context.getStore();
  return date ? new Date(`${date}T00:00:00.000Z`) : new Date();
}
async function clockMiddleware(req, res, next) {
  if (req.path.includes("/api/") || !req.accepts("html")) return next();
  try {
    const backend = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");
    const response = await fetch(`${backend}/api/system/current-date`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Tidak dapat membaca tanggal aplikasi.");
    const { demoDate } = await response.json();
    res.locals.demoDate = demoDate;
    res.locals.demoClockUnavailable = false;
    context.run(demoDate, next);
  } catch (_error) {
    res.locals.demoDate = null;
    res.locals.demoClockUnavailable = true;
    next();
  }
}
module.exports = { businessNow, clockMiddleware };
