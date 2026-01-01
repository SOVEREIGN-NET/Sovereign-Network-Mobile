# Screens Directory Structure

## File Organization

```
src/screens/
├── DashboardScreen.tsx
├── WalletScreen.tsx
├── DAOScreen.tsx
├── IdentityScreen.tsx
├── BrowserScreen.tsx
├── SendTokensScreen.tsx
├── ReceiveTokensScreen.tsx
├── ClaimUBIScreen.tsx
├── StakeTokensScreen.tsx
└── ProposalDetailScreen.tsx
```

## File Descriptions

### Main Screens (6 files)

#### DashboardScreen.tsx
```
Path: src/screens/DashboardScreen.tsx
Size: 95 lines
Exports: DashboardScreen (default)

Purpose: Main dashboard showing network status and quick actions
Navigation Parent: DashboardStack
Nested Screens: ClaimUBIScreen

Dependencies:
- React, useState
- ScrollView from react-native
- useAsyncData from hooks
- MockDataService from services
- colors, spacing from theme
- Card, Text, Button, ProgressBar, StatBox, DetailRow, LoadingView, Column, Row from components

State Management:
- data (from useAsyncData)
- loading (from useAsyncData)
- error (from useAsyncData)

Navigation:
- navigate('Wallet', { screen: 'SendTokens' })
- navigate('Dashboard', { screen: 'ClaimUBI' })
- navigate('DAO')
```

#### WalletScreen.tsx
```
Path: src/screens/WalletScreen.tsx
Size: 168 lines
Exports: WalletScreen (default)

Purpose: Manage wallets, view balances, see transactions
Navigation Parent: WalletStack
Nested Screens: SendTokensScreen, ReceiveTokensScreen, StakeTokensScreen

Dependencies:
- React, useState
- ScrollView, View, FlatList from react-native
- useAsyncData from hooks
- MockDataService from services
- colors, spacing from theme
- Card, Text, Button, LoadingView, Column, Row, ListItem from components
- getTransactionIcon, getTransactionColor from utils/colors

State Management:
- selectedWalletId (useState)
- data (from useAsyncData)
- loading (from useAsyncData)

Navigation:
- navigate('SendTokens')
- navigate('ReceiveTokens')
- navigate('Dashboard', { screen: 'ClaimUBI' })
- navigate('StakeTokens')
```

#### DAOScreen.tsx
```
Path: src/screens/DAOScreen.tsx
Size: 98 lines
Exports: DAOScreen (default)

Purpose: Vote on DAO proposals and view governance stats
Navigation Parent: DAOStack
Nested Screens: ProposalDetailScreen

Dependencies:
- React
- ScrollView from react-native
- useAsyncData from hooks
- MockDataService from services
- colors, spacing from theme
- Card, Text, Button, LoadingView, Column, Badge from components
- getProposalStatusColor, getCategoryIcon from utils/colors

State Management:
- data (from useAsyncData)
- loading (from useAsyncData)

Navigation:
- navigate('ProposalDetail', { proposalId })
```

#### IdentityScreen.tsx
```
Path: src/screens/IdentityScreen.tsx
Size: 165 lines
Exports: IdentityScreen (default)

Purpose: Manage ZK-DID identity and verification
Navigation Parent: IdentityStack
Nested Screens: None

Dependencies:
- React, useState
- ScrollView, View from react-native
- useAsyncData from hooks
- MockDataService, Identity type from services
- colors, spacing from theme
- Card, Text, Button, LoadingView, Column, Row, Badge, StatBox from components

State Management:
- selectedIdentityId (useState)
- data (from useAsyncData)
- loading (from useAsyncData)

Navigation: None (self-contained)
```

#### BrowserScreen.tsx
```
Path: src/screens/BrowserScreen.tsx
Size: 140 lines
Exports: BrowserScreen (default)

Purpose: Browse Web4 sites on ZHTP network
Navigation Parent: BrowserStack
Nested Screens: None

Dependencies:
- React, useState
- ScrollView from react-native
- colors, spacing from theme
- Card, Text, Button, Column, Input from components

State Management:
- currentUrl (useState)
- urlInput (useState)
- loading (useState)
- browserContent (useState)

Navigation: None (self-contained)

Data:
- mockWebsites object
- suggestedSites array
```

### Detail Screens (5 files)

#### SendTokensScreen.tsx
```
Path: src/screens/SendTokensScreen.tsx
Size: 31 lines
Exports: SendTokensScreen (default)

Purpose: Form to send ZHTP tokens
Navigation Parent: WalletStack
Accessed Via: WalletScreen button, DashboardScreen button

Props: { navigation }

Dependencies:
- React, useState
- ScrollView from react-native
- Card, Text, Button, Column, Input from components
- colors, spacing from theme

State Management:
- recipient (useState)
- amount (useState)

Navigation:
- navigation.goBack()
```

#### ReceiveTokensScreen.tsx
```
Path: src/screens/ReceiveTokensScreen.tsx
Size: 59 lines
Exports: ReceiveTokensScreen (default)

Purpose: Display wallet address for receiving tokens
Navigation Parent: WalletStack
Accessed Via: WalletScreen button

Props: { navigation }

Dependencies:
- React
- ScrollView, Share from react-native
- Card, Text, Button, Column from components
- colors, spacing from theme

State Management: None (stateless)

Navigation:
- navigation.goBack()
```

#### ClaimUBIScreen.tsx
```
Path: src/screens/ClaimUBIScreen.tsx
Size: 73 lines
Exports: ClaimUBIScreen (default)

Purpose: Claim monthly Universal Basic Income
Navigation Parent: DashboardStack
Accessed Via: DashboardScreen button, WalletScreen button

Props: { navigation }

Dependencies:
- React, useState
- ScrollView from react-native
- Card, Text, Button, Column, ProgressBar from components
- colors, spacing from theme

State Management:
- claimed (useState)

Navigation:
- navigation.goBack()
```

#### StakeTokensScreen.tsx
```
Path: src/screens/StakeTokensScreen.tsx
Size: 115 lines
Exports: StakeTokensScreen (default)

Purpose: Stake tokens for rewards
Navigation Parent: WalletStack
Accessed Via: WalletScreen button

Props: { navigation }

Dependencies:
- React, useState
- ScrollView from react-native
- Card, Text, Button, Column, Input, ProgressBar from components
- colors, spacing from theme

State Management:
- stakeAmount (useState)

Navigation:
- navigation.goBack()
```

#### ProposalDetailScreen.tsx
```
Path: src/screens/ProposalDetailScreen.tsx
Size: 89 lines
Exports: ProposalDetailScreen (default)

Purpose: View and vote on specific proposal
Navigation Parent: DAOStack
Accessed Via: DAOScreen button

Props: { route, navigation }
Route Params: { proposalId }

Dependencies:
- React
- ScrollView from react-native
- Card, Text, Button, Column, Badge, ProgressBar from components
- MockDataService from services
- colors, spacing from theme

State Management: None (stateless)

Navigation:
- navigation.goBack()

Data Source:
- Gets proposal from MockDataService.getProposals()
- Looks up by proposalId from route.params
```

## Import Structure

### Common Imports Pattern
```tsx
import React from 'react';
import { ScrollView } from 'react-native';
import { Card, Text, Button, Column } from '../components';
import { colors, spacing } from '../theme';
```

### Hook Imports Pattern
```tsx
import { useAsyncData } from '../hooks';
import MockDataService from '../services/MockDataService';
```

### Navigation Props Pattern
```tsx
const SomeScreen = ({ navigation }: any) => {
  // or
const SomeScreen = ({ route, navigation }: any) => {
  const params = route?.params;
```

## Component Distribution

### Card Component Usage
- DashboardScreen: 3 instances
- WalletScreen: 3 instances
- DAOScreen: 2 instances
- IdentityScreen: 3 instances
- BrowserScreen: 4 instances
- DetailScreens: 1-2 instances each
**Total: 22 instances**

### Text Component Usage
- All screens use Text component extensively
**Total: 80+ instances**

### Button Component Usage
- DashboardScreen: 4 instances
- WalletScreen: 4 instances
- DAOScreen: 1 instance
- IdentityScreen: 3 instances
- BrowserScreen: 8 instances
- DetailScreens: 2-4 instances each
**Total: 30+ instances**

### Column Component Usage
- All screens use Column for layout
**Total: 30+ instances**

## Navigation Registration

### In RootNavigator.tsx
```tsx
// Imports
import DashboardScreen from '../screens/DashboardScreen';
import SendTokensScreen from '../screens/SendTokensScreen';
// ... other imports

// Stack Registration
<Stack.Screen
  name="DashboardMain"
  component={DashboardScreen}
/>
<Stack.Screen
  name="SendTokens"
  component={SendTokensScreen}
/>
// ... other screens
```

## Size Analysis

### By Lines of Code
1. WalletScreen: 168 lines
2. IdentityScreen: 165 lines
3. BrowserScreen: 140 lines
4. StakeTokensScreen: 115 lines
5. ProposalDetailScreen: 89 lines
6. DAOScreen: 98 lines
7. DashboardScreen: 95 lines
8. ClaimUBIScreen: 73 lines
9. ReceiveTokensScreen: 59 lines
10. SendTokensScreen: 31 lines

**Total: 1,033 lines**

### Category Breakdown
- Main Screens: 666 lines (64%)
- Detail Screens: 367 lines (36%)

## Dependency Graph

```
DashboardScreen
├── uses: colors, spacing, useAsyncData, MockDataService
├── navigates to: WalletScreen (SendTokens), ClaimUBIScreen, DAOScreen
└── components: Card, Text, DetailRow, StatBox, ProgressBar, Button, Column, Row

WalletScreen
├── uses: colors, spacing, useAsyncData, MockDataService
├── navigates to: SendTokensScreen, ReceiveTokensScreen, StakeTokensScreen, ClaimUBIScreen
└── components: Card, Text, ListItem, Button, Column, Row

... (continue for other screens)
```

## Testing File Organization

### Test Files Location
```
__tests__/
├── hooks/
│   ├── useAsyncData.test.ts
│   └── useDebounce.test.ts
├── components/
│   ├── atoms/
│   │   ├── Button.test.tsx
│   │   ├── Card.test.tsx
│   │   └── Badge.test.tsx
│   └── molecules/
│       └── ProgressBar.test.tsx
├── utils/
│   ├── colors.test.ts
│   ├── dates.test.ts
│   └── numbers.test.ts
└── App.test.tsx
```

Note: Screen tests are minimal - focus on component and hook tests

## Related Files

### Configuration Files
- tsconfig.json - TypeScript configuration
- jest.config.js - Test configuration
- package.json - Dependencies and scripts
- .eslintrc - Linting rules

### Support Files
- src/theme/tokens.ts - Design tokens
- src/services/MockDataService.ts - Mock data
- src/navigation/RootNavigator.tsx - Navigation setup
- src/App.tsx - App entry point
