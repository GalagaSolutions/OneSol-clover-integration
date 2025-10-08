import axios from "axios";

/**
 * POST /clover/charge
 * For now returns a stubbed success so you can test GHL -> iFrame -> server loop.
 * Go live by sending a real Clover /v1/charges call with tokenized card 'source'.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).send("Method Not Allowed"); }
    const { amount, currency = "USD", source, metadata } = req.body || {};
    if (!amount || typeof amount !== "number") return res.status(400).json({ error: "Missing/invalid 'amount' (cents)" });

    const haveToken = !!process.env.CLOVER_ACCESS_TOKEN;
    const haveSource = !!source;

    // Stub success (until Clover is wired)
    if (!haveToken || !haveSource) {
      return res.status(200).json({
        id: "test_txn_" + Math.random().toString(36).slice(2, 10),
        amount, currency, metadata, stub: true
      });
    }

    // ==== REAL CLOVER REQUEST (uncomment when ready) ====
    // const r = await axios.post(
    //   "https://scl-sandbox.dev.clover.com/v1/charges",
    //   { amount, currency, source, capture: true, metadata },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${process.env.CLOVER_ACCESS_TOKEN}`,
    //       "Content-Type": "application/json"
    //     },
    //     timeout: 20000
    //   }
    // );
    // return res.status(200).json({ id: r.data?.id, amount, currency, metadata });

    return res.status(500).json({ error: "Unexpected flow" });
  } catch (e) {
    console.error("Clover charge failed:", e?.response?.data || e.message);
    return res.status(400).json({ error: "clover_charge_failed" });
  }
}
