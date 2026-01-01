# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A React Native mobile app (ZHTP Web4) with decentralized identity (ZK-DID), quantum-resistant cryptography, and blockchain integration. Uses atomic design for component architecture with custom hooks for state management and a centralized design token system.

## Development Commands

```bash
# Start development server
npm start

# Run all tests (102 tests, use --watch for development)
npm test
npm test -- --watch

# Run tests with coverage report
npm test -- --coverage

# Lint code with ESLint
npm lint

# Format code with Prettier
npm run format

# Build for native platforms
npm run android
npm run ios
```

## Architecture & Key Concepts

### Directory Structure
- **`src/screens/`** - 11 full-page components (DashboardScreen, WalletScreen, DAOScreen, IdentityScreen, BrowserScreen, + 6 detail screens)
- **`src/components/atoms/`** - Base UI primitives (Button, Card, Text, Input, Badge, etc.)
- **`src/components/molecules/`** - Composed components (DetailRow, StatBox, ListItem, Container, Toast)
- **`src/components/organisms/`** - Complex UI groups (LoadingView, ErrorView)
- **`src/navigation/`** - React Navigation 7 setup with nested bottom-tab + stack navigation
- **`src/theme/`** - Design tokens (colors, spacing, typography, shadows, breakpoints)
- **`src/i18n/`** - Localization system with English translations (extensible for more languages)
- **`src/hooks/`** - Custom hooks: `useAsyncData` (data fetching), `useDebounce`, `usePersistedState`
- **`src/services/`** - Business logic layer (MockDataService for demo data)
- **`src/types/`** - TypeScript domain models and navigation types
- **`src/utils/`** - Utility functions (colors, dates, numbers formatting)
- **`src/context/`** - React Context providers (ToastContext for notifications)

### Navigation Structure
5-tab bottom tab navigator with nested stack navigation:
1. **Dashboard** → ClaimUBIScreen
2. **Identity** → (single screen)
3. **Wallet** → SendTokensScreen, ReceiveTokensScreen, StakeTokensScreen
4. **DAO** → ProposalDetailScreen
5. **Browser** → (single screen)

All stacks inherit consistent header styling from `colors` tokens.

### Component Architecture: Atomic Design
- **Atoms**: Self-contained UI building blocks with no external logic
- **Molecules**: Combinations of atoms forming reusable UI patterns
- **Organisms**: Complex multi-component UI sections
- **Screens**: Full-page components using atoms, molecules, and organisms; handle navigation and data fetching

### Design System
**Colors**: All colors defined in `src/theme/tokens.ts`. Primary brand color is `#00d4ff` (cyan). Use semantic colors for status (success: `#51cf66`, error: `#ff6b6b`, warning: `#ffd43b`).

**Spacing**: Scale from `xxs: 2px` to `3xl: 48px`. Default card padding is `lg: 18px`.

**Typography**: Font sizes from `xs: 11px` to `5xl: 48px`. Font weights: normal (400), medium (500), semibold (600), bold (700).

**Border Radius**: Scale from `sm: 6px` to `2xl: 20px`, with `full: 9999` for circular elements.

**Shadows**: Defined as `none`, `sm`, `md`, `lg` with elevation values for both iOS and Android.

### State Management Pattern
- **Local component state**: Use React hooks (`useState`) for UI state
- **Async data**: Use custom `useAsyncData` hook for fetching and loading states
- **Persisted state**: Use `usePersistedState` for data that should survive app restarts
- **Global UI state**: Use React Context (ToastContext for notifications)
- **Mock data**: MockDataService provides realistic demo data for all screens during development

### i18n System
- Translations defined in `src/i18n/translations/en.ts` (currently English only)
- Use `useTranslation()` hook in components: `const { t } = useTranslation()`
- Access strings via dot notation: `t('screens.dashboard.title')`
- Register new languages by calling `registerLanguage()` with language code and translation object
- Type-safe translation keys through TypeScript

### Data Flow
1. Components render UI using atoms/molecules
2. Screens fetch data via `useAsyncData` hook or MockDataService
3. Data displayed via component props
4. User interactions trigger navigation or API calls
5. MockDataService simulates blockchain/API responses during development

## Code Quality

- **TypeScript**: Full type coverage with strict mode enabled
- **ESLint**: Uses `@react-native` config
- **Prettier**: Single quotes, avoid arrow parens, trailing commas on all arguments
- **Tests**: Jest with 102 passing tests covering hooks, components, and utilities
- **Coverage thresholds**: 30% minimum (branches, functions, lines, statements)

## Common Development Tasks

### Add a New Screen
1. Create component in `src/screens/NewScreen.tsx` (typically 50-150 lines)
2. Define TypeScript types in `src/types/models.ts` if needed
3. Create navigation param type in `src/types/navigation.ts`
4. Add Stack.Screen in `src/navigation/RootNavigator.tsx` to appropriate stack
5. Import useTranslation hook if screen has user-facing text
6. Write Jest tests in `__tests__/screens/NewScreen.test.tsx`

### Add UI Components
1. Create atom in `src/components/atoms/NewComponent/` if it's a base building block
2. Create molecule in `src/components/molecules/NewComponent/` if it composes atoms
3. Export from `src/components/index.ts` for convenience
4. Use design tokens from `src/theme/tokens.ts` for consistent styling
5. Write tests in `__tests__/components/`

### Fetch Data
Use `useAsyncData` hook from `src/hooks/useAsyncData.ts`:
```typescript
const { data, loading, error } = useAsyncData(
  () => mockService.getWallets(),
  [dependencies]
);
```

The hook handles loading states, error handling, and cleanup.

### Add Translations
1. Add key-value pairs to `src/i18n/translations/en.ts`
2. Update `Translation` type definition
3. Use in components: `const { t } = useTranslation(); t('key.path')`
4. To add new language: create translations file and call `registerLanguage('lang', translations)`

### Test a Single File
```bash
npm test -- path/to/file.test.ts
```

## Important Files to Know

- `src/theme/tokens.ts` - Single source of truth for all design values
- `src/i18n/i18n.ts` - i18n configuration and language management
- `src/navigation/RootNavigator.tsx` - Navigation structure definition
- `src/hooks/useAsyncData.ts` - Primary data fetching hook pattern
- `src/services/MockDataService.ts` - Demo data provider (update for real API integration)
- `src/types/models.ts` - Domain model types (Identity, Wallet, Proposal, etc.)
- `jest.config.js` - Test configuration with module path mapping for `src/*`

## Important Notes

- **No existing App.tsx file** - Root component likely handled by React Navigation or Metro bundler entry point
- **React 19 & React Native 0.82** - Using latest versions with modern hooks API
- **Node 20+** - Required by package.json engines field
- **All screens use i18n** - Text strings should use translation keys, not hardcoded strings
- **Design tokens are comprehensive** - Don't use hardcoded colors/spacing; always reference `theme/tokens.ts`
- **Mock data ready** - MockDataService provides realistic data for all features during development
