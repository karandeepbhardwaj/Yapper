import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem, AppSettings } from "./types";

export async function startRecording(): Promise<void> {
  await invoke("start_recording");
}

export async function stopRecording(): Promise<void> {
  await invoke("stop_recording");
}

export async function getHistory(): Promise<HistoryItem[]> {
  return await invoke("get_history");
}

export async function clearHistory(): Promise<void> {
  await invoke("clear_history");
}

export async function getSettings(): Promise<AppSettings> {
  return await invoke("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke("save_settings", { settings });
}
