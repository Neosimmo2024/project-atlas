export const runtime = "nodejs";

const IMAGE_BASE64 = "...";

export async function GET() {
  return new Response(Buffer.from(IMAGE_BASE64, "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
