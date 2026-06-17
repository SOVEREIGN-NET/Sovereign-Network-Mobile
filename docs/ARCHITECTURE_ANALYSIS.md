# Architecture Analysis

## Current System Architecture

### Technology Stack
- React Native with TypeScript
- React Navigation v7 (Tab + Stack navigation)
- Design system with centralized theme tokens
- Custom hooks for state management
- Jest for testing

### Project Structure
```
src/
├── components/       # UI component library (atoms, molecules, organisms)
├── screens/         # Screen components for navigation
├── navigation/      # React Navigation setup
├── hooks/           # Custom React hooks
├── services/        # Business logic and data services
├── utils/           # Utility functions
├── theme/           # Design tokens and theme configuration
└── types/           # TypeScript type definitions
```

## Navigation Structure

### Tab Navigation (5 tabs)
1. Dashboard (Home)
2. Identity (ZK-DID)
3. Wallet (Token management)
4. DAO (Governance)
5. Browser (Web4)

### Detail Screens
- SendTokensScreen (Wallet → Send)
- ReceiveTokensScreen (Wallet → Receive)
- StakeTokensScreen (Wallet → Stake)
- ClaimUBIScreen (Dashboard → Claim UBS)
- ProposalDetailScreen (DAO → Vote on Proposal)

## Component Architecture

### Atomic Design System
- **Atoms**: Basic building blocks (Button, Text, Input, Card, etc.)
- **Molecules**: Combinations of atoms (ListItem, StatBox, ProgressBar, etc.)
- **Organisms**: Complex components (LoadingView, ErrorBoundary, etc.)

### Key Components
- Card: Container for content sections
- Button: Action triggers with variants (primary, secondary, outline, danger)
- Text: Typography with variants (h1-h3, body, caption)
- Column/Row: Layout primitives for spacing
- Input: Text input fields
- Badge: Status indicators
- ProgressBar: Progress visualization
- LoadingView: Loading states
- ErrorBoundary: Error handling

## State Management

### Custom Hooks
- **useAsyncData**: Async data fetching with loading/error states
- **useDebounce**: Debounce values for search/filter
- **usePersistedState**: LocalStorage persistence

### Data Services
- MockDataService: Provides mock data for all screens
- Handles: Wallets, Transactions, Proposals, DAO stats, Network status

## Testing

### Test Coverage
- 102 passing tests across 10 test suites
- Component tests with snapshots
- Hook tests with proper React Testing Library patterns
- Utility function tests

### Test Setup
- Jest configuration with React Native mocking
- Proper mocking of native modules
- Mock for react-navigation

## Theme System

### Design Tokens
- **Colors**: Primary, backgrounds, text, semantic (success/error/warning)
- **Spacing**: xs to 3xl scale
- **Typography**: Sizes sm to 5xl, weights normal to bold
- **Border Radius**: sm to full
- **Shadows**: Elevation levels (none to lg)
- **Breakpoints**: Responsive design breakpoints

### Color Palette
- Primary: #00d4ff (cyan)
- Dark backgrounds: #0f0f1e, #1a1a2e, #16213e
- Success: #51cf66
- Error: #ff6b6b
- Warning: #ffd43b
