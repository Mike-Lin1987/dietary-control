import type { Metadata } from "next";
import LegacyHome from "./LegacyHome";

export const metadata: Metadata = {
  title: "NutriLens 飲食控制",
  description: "使用 AI 協助記錄餐點與營養攝取。",
};

export default function Home() {
  return <LegacyHome />;
}
