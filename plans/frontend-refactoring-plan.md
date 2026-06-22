# Frontend Refactoring Plan — Sovereign Network Mobile

## Overview
6 interconnected changes to the frontend navigation, dashboard, and data layers.

---

## 1. Default to SID Tab When Not Signed In

**Current State:** [`RootNavigator.tsx`](src/navigation/RootNavigator.tsx:770) — `MainTabs` always starts on DashboardTab (first tab in the navigator).

**Change:**
- In `MainTabs`, detect whether the user has an identity (from `useAuth()`).
- When no identity (`currentIdentity === null`), set `initialRouteName="SIDTab"`.
- When signed in, keep DashboardTab as default (current behavior).

**Files touched:**
- [`src/navigation/RootNavigator.tsx`](src/navigation/RootNavigator.tsx:756-818) — Add `useAuth()` import, conditional `initialRouteName`.

---

## 2. Remove All Fake/Hardcoded Metrics & Mock Data

### 2a. [`src/hooks/useTrendingDapps.ts`](src/hooks/useTrendingDapps.ts) — **DELETE or REPLACE**
This is entirely fake — `Math.random()` scrolls base users up/down every 8s with hardcoded `DAPP_CONFIGS`. 
- Remove the hook entirely.
- Replace with a real `useAvailableDapps` hook that loads from a static list or chain data (see item 5).

### 2b. [`src/hooks/useDAOStats.ts`](src/hooks/useDAOStats.ts) — **Disable fake increment**
Contains `Math.random()` based stat increment loop. 
- Remove the `setInterval` that fakes stat changes.
- Stats should only come from real API data (or show 0/empty when unavailable).

### 2c. [`src/hooks/useDaoStakes.ts`](src/hooks/useDaoStakes.ts) — **Comment says "mock implementation"**
- The hook's comment says "Swap the mock body for a quicRequest(...) call once the endpoint is wired."
- If the endpoint is wired: replace mock with real call.
- If not: expose a `stakes: [], loading: false` empty state (don't generate fake numbers).

### 2d. [`src/screens/BookmarksScreen.tsx`](src/screens/BookmarksScreen.tsx:61) — **Remove `mockBookmarks`**
- Replace `mockBookmarks` with an empty state message: "No bookmarks yet."

### 2e. [`src/screens/HistoryScreen.tsx`](src/screens/HistoryScreen.tsx:60) — **Remove `mockTransactions`**
- Replace `mockTransactions` with an empty state: "No transaction history."

### 2f. [`src/screens/BrowserScreen.tsx`](src/screens/BrowserScreen.tsx:61) — **Remove `mockWebsites`**
- Remove the hardcoded mock website content.
- Show "Page not found" or blank state when a real page can't be loaded.

### 2g. [`src/screens/ConfirmTransactionScreen.tsx`](src/screens/ConfirmTransactionScreen.tsx:20-21) — **Remove `Math.random()` simulation**
- Lines 20-23 simulate a 90% success rate with `Math.random()`.
- Replace with actual transaction submission logic.

### 2h. [`src/services/SovSwapMockData.ts`](src/services/SovSwapMockData.ts) — **Flag or remove**
- The `mockDAOs` array with `Math.random()` price generation.
- If real DAO data is not yet available, ship an empty state with messaging.

### 2i. [`src/screens/SIDScreen.tsx`](src/screens/SIDScreen.tsx:763-776) — **Remove hardcoded UBS data**
- Lines 769-775 hardcode `daily_amount: 33, monthly_amount: 1000, eligible: true`.
- Replace with real API call or show "Coming soon" / empty state.

### 2j. [`src/services/MockDataService.ts`](src/services/MockDataService.ts) — **Audit usage**
- Check if anything is still importing/using `MockDataService`.
- If yes, sever those imports and point them to real services or empty defaults.

### 2k. [`src/services/MessagingMockData.ts`](src/services/MessagingMockData.ts) — **Keep but document**
- This is development scaffolding, not production fake metrics. Keep but ensure it's never activated in release builds.

---

## 3. Utility Dropdown in Top-Left Navbar (SOV Counter Area)

**Current State:** [`HeaderBar.tsx`](src/components/molecules/HeaderBar/HeaderBar.tsx:219-226) — The SOV counter in the center is tappable (navigates to PoUW). No dropdown exists.

**Change:**
- Replace the simple `onBalancePress` handler with a dropdown popover anchored to the SOV counter area.
- Dropdown items:
  1. **Block Explorer** → navigate to `ExplorerDashboard`  
  2. **PoUW Rewards** → navigate to `PoUW`
  3. **Domains** → navigate to `MyDomains`  
- Remove these items from their current Dashboard positions (see below).

**Files touched:**
- [`src/components/molecules/HeaderBar/HeaderBar.tsx`](src/components/molecules/HeaderBar/HeaderBar.tsx) — Add dropdown toggle, popover, dropdown menu rendering.
- May need a new `DropDownMenu` molecule or use React Native's `Modal`.

### Items to REMOVE from Dashboard after adding to navbar dropdown:
- The **Explorer** card ([`DashboardScreen.tsx`](src/screens/DashboardScreen.tsx:323-337))
- The **PoUW Rewards** card ([`DashboardScreen.tsx`](src/screens/DashboardScreen.tsx:348)) — but note: `PouwRewardsCard` is also used for interactive visualization; we're only removing the duplicate entry, not the card component itself.

---

## 4. Remove Domains from SID Settings

**Current State:** [`SIDScreen.tsx`](src/screens/SIDScreen.tsx:1726) — The `WalletOptionsSheet` bottom sheet has a "domains" option (lines 135-141) that opens `DomainRegistrationScreen`.

**Change:**
- Remove the "domains" row from `WalletOptionsSheet`.
- Domains are now accessible from the navbar dropdown (item 3 above).
- Also remove the `DomainRegistrationScreen` modal (`domainRegistrationModalVisible` state and the entire Modal block at lines 1703-1713 in SIDScreen).

**Files touched:**
- [`src/screens/SIDScreen.tsx`](src/screens/SIDScreen.tsx) — Remove domains row from `WalletOptionRow[]`, remove domain registration modal.

---

## 5. Dashboard: Replace Trending Dapps/Tokens with Available Dapps

**Current State:** [`DashboardScreen.tsx`](src/screens/DashboardScreen.tsx:53-448) — 
- Lines 231-321: "Trending Dapps" card (uses fake `useTrendingDapps`)
- Lines 350-442: "Trending Tokens" card (uses real-ish `useTrendingTokens`)

**Change:**
- **Remove:** "Trending Dapps" card (231-321) — already flagged for removal in item 2a.
- **Remove:** "Trending Tokens" card (350-442) — per user request.
- **Add:** "Available Dapps" section — a static/curated list of real dapps on the network (Central.sov, SovSwap, Ballot, etc.) as flat cards with navigation.

**Files touched:**
- [`src/screens/DashboardScreen.tsx`](src/screens/DashboardScreen.tsx) — Remove trending dapps/tokens sections, add Available Dapps section.
- `src/hooks/useAvailableDapps.ts` (new) — Static list of available dapps (no fake randomization).

---

## 6. Dashboard: Search Engine Layout with Scroll Arrows

**Current State:** [`DashboardScreen.tsx`](src/screens/DashboardScreen.tsx) — Linear scroll with URL bar at top, then cards below.

**Change:**
Restructure DashboardScreen into a full-screen search experience:

```
┌─────────────────────────┐
│  HeaderBar (SOV counter │
│  + utility dropdown)    │
├─────────────────────────┤
│                         │
│     🔶 S-Shield Logo    │
│                         │
│  ┌─────────────────┐    │
│  │ zhtp://...      │→│  │  ← Search bar
│  └─────────────────┘    │
│          ↓              │  ← Arrow (tap to scroll down)
│   "Available Dapps"     │  ← Label below arrow
│                         │
├─────────────────────────┤
│  ┌─────────────────┐    │
│  │ Central.sov     │    │  ← Available Dapp card
│  │ CBE applications│    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │ SovSwap         │    │
│  │ DAO registry    │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │ Ballot          │    │
│  │ Voting Platform │    │
│  └─────────────────┘    │
│          ↑              │  ← Arrow (tap to scroll up)
│   "Back to Search"      │
└─────────────────────────┘
```

**Mechanics:**
- Use a `ScrollView` with a `ref` for programmatic scrolling.
- **Down arrow:** below the search bar. On tap, scrolls to the "Available Dapps" section header.
- **Up arrow:** at the bottom of the dapps list. On tap, scrolls back to the search bar at top.
- Both arrows should be simple `Pressable` elements with `↓` / `↑` characters.

**Files touched:**
- [`src/screens/DashboardScreen.tsx`](src/screens/DashboardScreen.tsx) — Complete restructure of the scroll layout.

---

## Execution Order

| Step | Item | Dependencies | Complexity |
|------|------|-------------|------------|
| 1 | Default SID tab for guests | None | Low |
| 2 | Remove fake metrics (all sub-items) | None | Medium |
| 3 | Navbar utility dropdown | None | Medium |
| 4 | Remove dashbard items (Explorer+PoUW card) | Depends on #3 (dropdown exists) | Low |
| 5 | Remove domains from SID settings | None | Low |
| 6 | Dashboard: Available Dapps | Depends on #2a (trending dapps removed) | Low |
| 7 | Dashboard: Search engine layout | Depends on #4, #6 | Medium |

## Files Summary

| Action | File |
|--------|------|
| MODIFY | [`src/navigation/RootNavigator.tsx`](src/navigation/RootNavigator.tsx) |
| MODIFY | [`src/components/molecules/HeaderBar/HeaderBar.tsx`](src/components/molecules/HeaderBar/HeaderBar.tsx) |
| MODIFY | [`src/screens/DashboardScreen.tsx`](src/screens/DashboardScreen.tsx) |
| MODIFY | [`src/screens/SIDScreen.tsx`](src/screens/SIDScreen.tsx) |
| MODIFY | [`src/screens/BookmarksScreen.tsx`](src/screens/BookmarksScreen.tsx) |
| MODIFY | [`src/screens/HistoryScreen.tsx`](src/screens/HistoryScreen.tsx) |
| MODIFY | [`src/screens/BrowserScreen.tsx`](src/screens/BrowserScreen.tsx) |
| MODIFY | [`src/screens/ConfirmTransactionScreen.tsx`](src/screens/ConfirmTransactionScreen.tsx) |
| MODIFY | [`src/hooks/useDAOStats.ts`](src/hooks/useDAOStats.ts) |
| MODIFY | [`src/hooks/useDaoStakes.ts`](src/hooks/useDaoStakes.ts) |
| DELETE | [`src/hooks/useTrendingDapps.ts`](src/hooks/useTrendingDapps.ts) (or replace) |
| CREATE | `src/hooks/useAvailableDapps.ts` |
