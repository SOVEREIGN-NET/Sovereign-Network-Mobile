# Foundation Quick Start Guide

## Getting Started

### Installation
```bash
npm install
```

### Run Tests
```bash
npm test
```

### Start Dev Server
```bash
npm start
```

### Build for Android
```bash
npm run android
```

### Build for iOS
```bash
npm run ios
```

## File Structure

```
src/
├── components/
│   ├── atoms/          # Base UI components
│   ├── molecules/      # Composite components
│   ├── organisms/      # Complex components
│   └── index.ts        # Export all components
├── screens/            # Navigation screens
│   ├── DashboardScreen.tsx
│   ├── WalletScreen.tsx
│   ├── DAO­Screen.tsx
│   ├── IdentityScreen.tsx
│   ├── BrowserScreen.tsx
│   ├── SendTokensScreen.tsx
│   ├── ReceiveTokensScreen.tsx
│   ├── StakeTokensScreen.tsx
│   ├── ClaimUBIScreen.tsx
│   └── ProposalDetailScreen.tsx
├── navigation/
│   └── RootNavigator.tsx
├── hooks/              # Custom React hooks
│   ├── useAsyncData.ts
│   ├── useDebounce.ts
│   ├── usePersistedState.ts
│   └── index.ts
├── services/           # Business logic
│   └── MockDataService.ts
├── utils/              # Utility functions
│   ├── colors.ts
│   ├── dates.ts
│   ├── numbers.ts
│   └── constants.ts
└── theme/              # Design tokens
    ├── tokens.ts
    └── index.ts
```

## Component Usage Examples

### Using Card Component
```tsx
import { Card, Text } from '../components';

<Card>
  <Text variant="h2">Title</Text>
  <Text variant="body">Content here</Text>
</Card>
```

### Using Button Component
```tsx
import { Button } from '../components';

<Button
  onPress={() => console.log('Clicked')}
  variant="primary"
  size="md"
>
  Click Me
</Button>
```

### Using Input Component
```tsx
import { Input } from '../components';

const [value, setValue] = useState('');

<Input
  placeholder="Enter text"
  value={value}
  onChangeText={setValue}
/>
```

### Using useAsyncData Hook
```tsx
import { useAsyncData } from '../hooks';

const { data, loading, error, retry } = useAsyncData(
  async () => {
    return await fetchSomeData();
  },
  []  // dependencies
);

if (loading) return <LoadingView />;
if (error) return <ErrorView error={error} onRetry={retry} />;
return <Text>{data}</Text>;
```

## Theme System

### Accessing Design Tokens
```tsx
import { colors, spacing, typography } from '../theme';

<View style={{ backgroundColor: colors.primary, padding: spacing.md }}>
  <Text style={{ fontSize: typography.size.lg }}>Text</Text>
</View>
```

### Available Colors
- `colors.primary` - #00d4ff (cyan)
- `colors.success` - #51cf66 (green)
- `colors.error` - #ff6b6b (red)
- `colors.warning` - #ffd43b (yellow)
- `colors.bg_dark` - #1a1a2e (main background)
- `colors.text_primary` - #ffffff (main text)

### Available Spacing
- `spacing.xs` - 4px
- `spacing.sm` - 8px
- `spacing.md` - 12px
- `spacing.lg` - 16px
- `spacing.xl` - 24px
- `spacing['2xl']` - 32px
- `spacing['3xl']` - 48px

## Navigation

### Navigate to Screen
```tsx
import { useNavigation } from '@react-navigation/native';

const navigation = useNavigation();

// Navigate to tab
navigation.navigate('Wallet');

// Navigate to nested screen
navigation.navigate('Wallet', { screen: 'SendTokens' });

// Go back
navigation.goBack();
```

## Testing

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Update Snapshots
```bash
npm test -- --updateSnapshot
```

### Test Component
```tsx
import renderer from 'react-test-renderer';
import { Button } from '../components';

it('renders button', () => {
  const tree = renderer
    .create(<Button>Click</Button>)
    .toJSON();
  expect(tree).toMatchSnapshot();
});
```

### Test Hook
```tsx
import { renderHook, act } from '@testing-library/react-native';
import { useAsyncData } from '../hooks';

it('fetches data', async () => {
  const { result } = renderHook(() =>
    useAsyncData(async () => ({ data: 'test' }), [])
  );

  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  expect(result.current.data).toEqual({ data: 'test' });
});
```

## Common Patterns

### Loading State
```tsx
import { LoadingView } from '../components';

if (loading) {
  return <LoadingView message="Loading data..." />;
}
```

### Error Handling
```tsx
import { ErrorView } from '../components';

if (error) {
  return (
    <ErrorView
      error={error}
      onRetry={retry}
    />
  );
}
```

### List Display
```tsx
import { Column, ListItem } from '../components';

<Column gap="sm">
  {items.map(item => (
    <ListItem
      key={item.id}
      title={item.name}
      subtitle={item.description}
      onPress={() => handleSelect(item)}
    />
  ))}
</Column>
```

### Form Input
```tsx
import { Input, Button, Column } from '../components';

<Column gap="md">
  <Input
    placeholder="Email"
    value={email}
    onChangeText={setEmail}
    keyboardType="email-address"
  />
  <Button onPress={handleSubmit}>
    Submit
  </Button>
</Column>
```

## Debugging

### Enable Redux DevTools
```tsx
// In RootNavigator or App component
if (__DEV__) {
  console.log('Dev mode enabled');
}
```

### Console Logging
```tsx
console.log('Debug:', data);
console.warn('Warning:', message);
console.error('Error:', error);
```

### React DevTools
Install React Native Debugger for better debugging experience.

## Performance Tips

1. Use React.memo for expensive components
2. Memoize callbacks with useCallback
3. Use useMemo for expensive calculations
4. Lazy load screens when possible
5. Optimize images and assets

## Common Issues & Solutions

### "Cannot find module" errors
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear cache: `npm cache clean --force`

### Tests failing
- Update snapshots: `npm test -- --updateSnapshot`
- Clear jest cache: `npm test -- --clearCache`

### Navigation not working
- Ensure screen name matches in navigation options
- Check screen prop is correct component
- Verify navigation parameter naming

## Next Steps

1. Review component documentation
2. Explore existing screens for patterns
3. Create new screens using existing components
4. Add tests for new features
5. Test on Android/iOS devices

## Resources

- React Native Docs: https://reactnative.dev
- React Navigation: https://reactnavigation.org
- React Hooks: https://react.dev/reference/react/hooks
- TypeScript: https://www.typescriptlang.org
