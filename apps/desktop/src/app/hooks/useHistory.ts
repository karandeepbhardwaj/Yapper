import { useState, useEffect, useCallback } from "react";
import type { HistoryItem } from "../lib/types";
import { getHistory, clearHistory as clearHistoryApi } from "../lib/tauri-bridge";

const SAMPLE_DATA: HistoryItem[] = [
  {
    id: "sample-1",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    title: "The Future of Sound Engineering in Digital Spaces",
    refinedText: "In the next decade, we're going to see a shift from simple stereo recording to high-fidelity spatial captures that incorporate biometric markers. The transcript isn't just words; it's the architecture of the moment.",
    rawTranscript: "in the next decade were gonna see a shift from like simple stereo recording to high fidelity spatial captures that incorporate biometric markers the transcript isnt just words its the architecture of the moment",
    category: "Interview",
    isPinned: false,
  },
  {
    id: "sample-2",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    title: "Quick Idea: UI Transitions",
    refinedText: "Using ghost borders for focus states instead of solid outlines might reduce the cognitive load for neurodivergent users. Need to prototype this with the design system team.",
    rawTranscript: "using ghost borders for focus states instead of solid outlines might reduce cognitive load for neurodivergent users need to prototype this with design system team",
    category: "Thought",
  },
  {
    id: "sample-3",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    title: "Weekly Retro Notes",
    refinedText: "Achievements this week: Finalized the design system tokens. Need to improve documentation on the no-divider rule for developers. Sprint velocity is up 15% from last quarter.",
    rawTranscript: "achievements this week finalized design system tokens need to improve documentation on no divider rule for developers sprint velocity is up 15 percent from last quarter",
    category: "Work",
  },
  {
    id: "sample-4",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    title: "Strategic Product Roadmap 2025",
    refinedText: "Expanding the ecosystem to support multi-device synchronization and secure cloud-native transcript storage. Key priorities: end-to-end encryption, real-time collaboration, and API access for enterprise customers.",
    rawTranscript: "expanding the ecosystem to support multi device synchronization and secure cloud native transcript storage key priorities end to end encryption real time collaboration and api access for enterprise customers",
    category: "Strategy",
    isPinned: true,
  },
  {
    id: "sample-5",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    title: "Accessibility Audit Findings",
    refinedText: "Screen reader compatibility is at 87%. Main gaps: dynamic content updates not announced, some custom components missing ARIA labels. Color contrast passes WCAG AA but fails AAA on secondary text.",
    rawTranscript: "screen reader compatibility is at 87 percent main gaps dynamic content updates not announced some custom components missing aria labels color contrast passes wcag aa but fails aaa on secondary text",
    category: "Research",
  },
  {
    id: "sample-6",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    title: "Customer Interview: Enterprise Onboarding",
    refinedText: "The onboarding flow needs to handle SSO configuration within the first 5 minutes. IT admins want a dashboard view showing adoption metrics across departments. Self-service provisioning is a dealbreaker.",
    rawTranscript: "the onboarding flow needs to handle sso configuration within the first 5 minutes it admins want a dashboard view showing adoption metrics across departments self service provisioning is a dealbreaker",
    category: "Interview",
  },
];

export function useHistory() {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    getHistory()
      .then((items) => {
        if (items.length === 0) {
          // Load sample data on first run
          setHistoryItems(SAMPLE_DATA);
        } else {
          setHistoryItems(items);
        }
      })
      .catch(() => {
        setHistoryItems(SAMPLE_DATA);
      });
  }, []);

  const addItem = useCallback((item: HistoryItem) => {
    setHistoryItems((prev) => [item, ...prev]);
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await clearHistoryApi();
    } catch {}
    setHistoryItems([]);
  }, []);

  const togglePin = useCallback((id: string) => {
    setHistoryItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPinned: !item.isPinned } : item
      )
    );
  }, []);

  return { historyItems, addItem, clearAll, togglePin };
}
