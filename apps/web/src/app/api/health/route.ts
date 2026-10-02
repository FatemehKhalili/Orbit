// Liveness for the web app itself. It does not call the API, so the frontend can be
// deployed and health-checked independently of the backend.
export function GET() {
  return Response.json({ status: "ok", service: "orbit-web" });
}
