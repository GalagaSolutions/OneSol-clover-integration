/**
 * GET /pay/clover
 * Your paymentsUrl iFrame. GHL sends payment details here.
 */
export default async function handler(_req, res) {
  const html = `<!doctype html>
<html><body>
<script>
  // Tell GHL we're ready
  parent.postMessage({ type: "payment_iframe_ready" }, "*");

  // Receive payment details
  window.addEventListener("message", async (event) => {
    if (event?.data?.type !== "payment_initiate_props") return;
    try {
      const { amount, currency, metadata } = event.data.payload || {};

      // TODO: tokenize card via Clover SDK/hosted fields, then include 'source'
      const r = await fetch("/clover/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, metadata /*, source */ })
      });
      if (!r.ok) throw new Error("Charge failed");
      const charge = await r.json();

      parent.postMessage({ type: "payment_success", payload: { transactionId: charge.id, amount, currency } }, "*");
    } catch (err) {
      parent.postMessage({ type: "payment_failed", payload: { message: err?.message || "Charge error" } }, "*");
    }
  });
</script>
</body></html>`;
  res.setHeader("Content-Type", "text/html");
  return res.status(200).send(html);
}
