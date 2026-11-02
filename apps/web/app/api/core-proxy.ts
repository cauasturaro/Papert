import type { NextRequest } from "next/server";

export async function proxyCore(request: NextRequest, resource: string) {
  try {
    const headers = new Headers();

    for (const name of ["cookie", "origin", "content-type"]) {
      const value = request.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    }

    const upstream = await fetch(
      `${process.env.CORE_API_URL ?? "http://localhost:3001"}/${resource}`,
      {
        method: request.method,
        headers,
        body: ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
          ? await request.text()
          : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );

    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    });

    for (const name of ["set-cookie", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) {
        responseHeaders.set(name, value);
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { message: "The service is unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
