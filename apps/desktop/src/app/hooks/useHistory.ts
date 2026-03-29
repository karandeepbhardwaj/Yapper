import { useState, useEffect, useCallback } from "react";
import type { HistoryItem } from "../lib/types";
import { getHistory, clearHistory as clearHistoryApi, deleteHistoryItem as deleteHistoryItemApi, togglePinItem as togglePinItemApi } from "../lib/tauri-bridge";

const SAMPLE_DATA: HistoryItem[] = [
  {
    id: "sample-1",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    title: "The Future of Sound Engineering in Digital Spaces",
    refinedText: "In the next decade, we're going to see a shift from simple stereo recording to high-fidelity spatial captures that incorporate biometric markers. The transcript isn't just words; it's the architecture of the moment.",
    rawTranscript: "in the next decade were gonna see a shift from like simple stereo recording to high fidelity spatial captures that incorporate biometric markers the transcript isnt just words its the architecture of the moment",
    category: "Interview",
  },
  {
    id: "sample-2",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    title: "Quick Idea: UI Transitions",
    refinedText: "Using ghost borders for focus states instead of solid outlines might reduce the cognitive load for neurodivergent users. Need to prototype this with the design system team.",
    rawTranscript: "using ghost borders for focus states instead of solid outlines might reduce cognitive load for neurodivergent users need to prototype this with design system team",
    category: "Thought",
  },
  {
    id: "sample-3",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    title: "Weekly Retro Notes",
    refinedText: "Achievements this week: Finalized the design system tokens. Need to improve documentation on the no-divider rule for developers. Sprint velocity is up 15% from last quarter.",
    rawTranscript: "achievements this week finalized design system tokens need to improve documentation on no divider rule for developers sprint velocity is up 15 percent from last quarter",
    category: "Work",
    isPinned: true,
  },
  {
    id: "sample-4",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    title: "Strategic Product Roadmap 2025",
    refinedText: "Expanding the ecosystem to support multi-device synchronization and secure cloud-native transcript storage. Key priorities: end-to-end encryption, real-time collaboration, and API access for enterprise customers.",
    rawTranscript: "expanding the ecosystem to support multi device synchronization and secure cloud native transcript storage key priorities end to end encryption real time collaboration and api access for enterprise customers",
    category: "Strategy",
  },
  {
    id: "sample-5",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    title: "Lunch Chat with Sarah About the Rebrand",
    refinedText: "Sarah thinks the new color palette needs more warmth. She suggested exploring terracotta and amber tones instead of the cool grays we've been using. Also mentioned that the logo feels too corporate for a creative tool.",
    rawTranscript: "sarah thinks the new color palette needs more warmth she suggested exploring terracotta and amber tones instead of the cool grays weve been using also mentioned that the logo feels too corporate for a creative tool",
    category: "Thought",
  },
  {
    id: "sample-6",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    title: "Accessibility Audit Findings",
    refinedText: "Screen reader compatibility is at 87%. Main gaps: dynamic content updates not announced, some custom components missing ARIA labels. Color contrast passes WCAG AA but fails AAA on secondary text.",
    rawTranscript: "screen reader compatibility is at 87 percent main gaps dynamic content updates not announced some custom components missing aria labels color contrast passes wcag aa but fails aaa on secondary text",
    category: "Research",
    isPinned: true,
  },
  {
    id: "sample-7",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    title: "Customer Interview: Enterprise Onboarding",
    refinedText: "The onboarding flow needs to handle SSO configuration within the first 5 minutes. IT admins want a dashboard view showing adoption metrics across departments. Self-service provisioning is a dealbreaker.",
    rawTranscript: "the onboarding flow needs to handle sso configuration within the first 5 minutes it admins want a dashboard view showing adoption metrics across departments self service provisioning is a dealbreaker",
    category: "Interview",
  },
  {
    id: "sample-8",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    title: "Draft: Email to Investors Q1 Update",
    refinedText: "Dear partners, I'm pleased to share our Q1 results. Monthly active users grew 34% quarter-over-quarter. Revenue is tracking ahead of projections by 12%. We've secured two new enterprise contracts and expanded into three additional markets.",
    rawTranscript: "dear partners im pleased to share our q1 results monthly active users grew 34 percent quarter over quarter revenue is tracking ahead of projections by 12 percent weve secured two new enterprise contracts and expanded into three additional markets",
    category: "Email",
  },
  {
    id: "sample-9",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    title: "Voice Note: App Store Description Ideas",
    refinedText: "Yapper captures your voice and turns it into polished text instantly. No typing, no editing, just speak and paste. Works offline with on-device transcription. Your words, refined by AI, ready in seconds.",
    rawTranscript: "yapper captures your voice and turns it into polished text instantly no typing no editing just speak and paste works offline with on device transcription your words refined by ai ready in seconds",
    category: "Creative",
  },
  {
    id: "sample-10",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    title: "Bug Report: Widget Disappears on External Display",
    refinedText: "When connecting an external monitor and moving the app to the second screen, the floating widget sometimes fails to reposition. Reproducible about 30% of the time. Likely related to the NSPanel screen detection polling interval.",
    rawTranscript: "when connecting an external monitor and moving the app to the second screen the floating widget sometimes fails to reposition reproducible about 30 percent of the time likely related to the ns panel screen detection polling interval",
    category: "Work",
  },
];

export function useHistory() {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    getHistory()
      .then((items) => {
        if (items.length === 0) {
          setHistoryItems(SAMPLE_DATA);
        } else {
          setHistoryItems(items);
        }
      })
      .catch((e) => {
        console.error("Failed to load history:", e);
        setHistoryItems(SAMPLE_DATA);
      });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const items = await getHistory();
      setHistoryItems(items.length === 0 ? SAMPLE_DATA : items);
    } catch (e) {
      console.error("Failed to refresh history:", e);
    }
  }, []);

  const addItem = useCallback((item: HistoryItem) => {
    setHistoryItems((prev) => [item, ...prev]);
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await clearHistoryApi();
    } catch (e) { console.error("Failed to clear history:", e); }
    setHistoryItems([]);
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    try {
      await deleteHistoryItemApi(id);
    } catch (e) { console.error("Failed to delete history item:", e); }
    setHistoryItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const togglePin = useCallback(async (id: string) => {
    try {
      await togglePinItemApi(id);
    } catch (e) { console.error("Failed to toggle pin item:", e); }
    setHistoryItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPinned: !item.isPinned } : item
      )
    );
  }, []);

  return { historyItems, addItem, refresh, clearAll, deleteItem, togglePin };
}
