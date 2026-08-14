/* eslint-disable @typescript-eslint/no-explicit-any */
import { requestAccessStatus } from "../../access-api.js";
import { getAccessConfig } from "../../access-config";
import { runtimeValue } from "../../runtime";
import { errorResponse, json, ApiError } from "../_lib";

const nutritionResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["foods", "total_calories", "total_protein_g", "total_fat_g", "total_carbs_g", "meal_type", "confidence", "notes"],
  properties: {
    foods: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "portion", "calories", "protein_g", "fat_g", "carbs_g", "uncertain"], properties: { name: { type: "string" }, portion: { type: "string" }, calories: { type: "number" }, protein_g: { type: "number" }, fat_g: { type: "number" }, carbs_g: { type: "number" }, uncertain: { type: "boolean" } } } },
    total_calories: { type: "number" }, total_protein_g: { type: "number" }, total_fat_g: { type: "number" }, total_carbs_g: { type: "number" },
    meal_type: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] }, notes: { type: "string" },
  },
};

function buildPrompt(payload: Record<string, unknown>) {
  const mealType = String(payload.mealType || "未指定");
  const userNote = String(payload.userNote || "");
  const previous = payload.previousResult ? `\n前一次分析：${JSON.stringify(payload.previousResult)}` : "";
  return `你是 NutriLens 的營養估算助手。請分析使用者提供的餐點照片，輸出符合指定 JSON Schema 的繁體中文結果。餐別：${mealType}。使用者補充：${userNote}${previous}\n若照片無法辨識，仍需誠實標示低信心並在 notes 說明，不要捏造精確數值。每個食物都要包含 name、portion、calories、protein_g、fat_g、carbs_g、uncertain。`;
}

function responseText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;
  return data.output?.flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === "output_text" && typeof part.text === "string").map((part: any) => part.text).join("") || "";
}

export async function POST(request: Request) {
  try {
    const access = await requestAccessStatus(request, { getConfig: getAccessConfig });
    if (!access.valid) throw new ApiError(401, "ACCESS_REQUIRED", "請先輸入允許碼啟用此裝置。 ");
    const payload = (await request.json()) as Record<string, unknown>;
    const image = typeof payload.image === "string" ? payload.image : "";
    const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "";
    if (!image || !/^image\/(jpeg|png|webp|gif)$/i.test(mimeType) || image.length > 8_000_000) {
      throw new ApiError(400, "INVALID_IMAGE", "請提供有效且大小合適的餐點照片。 ");
    }
    const apiKey = runtimeValue("OPENAI_API_KEY");
    if (!apiKey) throw new ApiError(503, "AI_NOT_CONFIGURED", "AI 分析服務尚未設定。 ");
    const model = runtimeValue("OPENAI_MODEL") || "gpt-5.2";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          store: false,
          input: [{ role: "user", content: [{ type: "input_text", text: buildPrompt(payload) }, { type: "input_image", image_url: `data:${mimeType};base64,${image}`, detail: "high" }] }],
          text: { format: { type: "json_schema", name: "nutrition_analysis", strict: true, schema: nutritionResponseSchema } },
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(response.status, "OPENAI_ERROR", data?.error?.message || "AI 分析服務回應錯誤。 ");
      const raw = responseText(data).replace(/```json/g, "").replace(/```/g, "").trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) throw new ApiError(502, "AI_INVALID_RESPONSE", "AI 沒有回傳可用的分析結果。 ");
      return json({ ...JSON.parse(raw.slice(start, end + 1)), model });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
