export const runtime = "nodejs";

const SOURCE_LOGO_URL = "https://raw.githubusercontent.com/Neosimmo2024/project-atlas/705f677a85485dec6840e8f008b2c6761109e800/apps/web/public/neos-email-logo.jpg";

export async function GET() {
  const response = await fetch(SOURCE_LOGO_URL, { cache: "force-cache" });
  if (!response.ok) {
    return new Response("Logo unavailable", { status: 502 });
  }

  const image = await response.arrayBuffer();
  return new Response(image, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
