const TARGET_BASE_URL = "https://aiplatform.googleapis.com/v1/publishers/google/models";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    let apiKey = req.headers.get("x-goog-api-key");
    if (!apiKey) {
      apiKey = url.searchParams.get("key");
    }

    if (!apiKey) {
      return new Response(
        "Missing API Key (x-goog-api-key header or key query param)",
        { status: 401 },
      );
    }

    const pathRegex = /models\/([^:]+)(:.*)$/;
    const match = url.pathname.match(pathRegex);

    if (!match) {
      return new Response(
        "Invalid URL format. Expected .../models/{model}:{action}",
        { status: 400 },
      );
    }

    let modelName = match[1];
    const action = match[2];

    // 模型重定向：把客户端的“假 2.5”映射到 Vertex 的 gemini-3-pro-preview
    if (modelName.includes("gemini-2.5-pro-actually-3")) {
      console.log(
        `[Proxy] Redirecting model: ${modelName} -> gemini-3-pro-preview`,
      );
      modelName = "gemini-3-pro-preview";
    }

    // 构造真正要发给 Vertex 的查询参数（带真实 key）
    const newParams = new URLSearchParams(url.searchParams);
    newParams.set("key", apiKey);

    const targetUrl = `${TARGET_BASE_URL}/${modelName}${action}?${newParams.toString()}`;

    // ✅ 为了安全，只打印打码后的 URL 到日志，不泄露真实 key
    const safeParams = new URLSearchParams(newParams);
    if (safeParams.has("key")) {
      safeParams.set("key", "***");
    }
    const safeUrlForLog =
      `${TARGET_BASE_URL}/${modelName}${action}?${safeParams.toString()}`;
    console.log(`[Proxy] Forwarding to: ${safeUrlForLog}`);

    const proxyResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: req.body, // 直接把原始 body 转发过去
    });

    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      headers: {
        "Content-Type":
          proxyResponse.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error("Proxy Error:", error);
    return new Response(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
});
