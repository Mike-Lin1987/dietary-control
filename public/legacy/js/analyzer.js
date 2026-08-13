/** Client adapter for the server-side OpenAI analysis endpoint. */
export async function analyzeFood(base64, mimeType, mealType, userNote = "", previousResult = null) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: base64, mimeType, mealType, userNote, previousResult }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "AI 分析失敗，請稍後再試。");
  }
  return data;
}
