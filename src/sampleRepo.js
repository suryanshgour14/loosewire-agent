export const SAMPLE_FILES = [
  { path: "src/config.ts", content: 'export const API_SECRET = "sk_live_51H8K2w91unsafe";\n' },
  { path: "src/checkout.ts", content: `export async function checkout(order) {
  try {
    return await charge(order);
  } catch (error) {}
}
` },
  { path: "src/payment.ts", content: `export async function capturePayment(payment) {
  // TODO: add idempotency handling before release
  return gateway.capture(payment);
}
` },
  { path: "test/checkout.test.ts", content: 'test("rejects an invalid order", () => {});\n' },
  { path: "README.md", content: "# Sample checkout\n" },
  { path: ".gitignore", content: "node_modules\n.env\n" },
];
