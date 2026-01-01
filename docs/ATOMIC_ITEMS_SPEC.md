# Atomic Items Specification

## Component Inventory

### Atoms (Base Components)

#### Card
- Container component for content sections
- Props: children, style, variant
- Styling: Rounded corners, dark background, padding

#### Button
- Interactive element for actions
- Variants: primary, secondary, outline, danger
- Sizes: sm, md, lg
- States: normal, disabled, loading
- Props: onPress, children, variant, size, disabled, loading, style

#### Text
- Typography component for all text content
- Variants: h1, h2, h3, body, caption
- Weights: normal, medium, semibold, bold
- Props: children, variant, weight, style

#### Input
- Text input field
- Props: placeholder, value, onChangeText, keyboardType, style
- Types: text (default), decimal-pad, email-address, phone-pad

#### Badge
- Status indicator component
- Variants: info, success, warning, error
- Sizes: sm, md, lg
- Props: label, variant, size, style

#### Checkbox
- Boolean input element
- Props: value, onChange, disabled, style

#### Switch
- Toggle component
- Props: value, onChange, disabled, style

#### Divider
- Visual separator
- Props: style, color, thickness

#### Spacer
- Empty space component for layout
- Sizes: xs, sm, md, lg, xl
- Props: size, style

#### Column
- Flex column layout with gap
- Props: children, gap, style
- Gap values: xs, sm, md, lg, xl

#### Row
- Flex row layout with gap
- Props: children, gap, style
- Gap values: xs, sm, md, lg, xl

### Molecules (Composite Components)

#### ListItem
- Row component for list items
- Props: title, subtitle, leftIcon, rightContent, onPress, style
- Used in: Wallet selection, Transaction lists

#### StatBox
- Statistics display component
- Props: label, value, style
- Used in: Dashboard, DAO stats

#### DetailRow
- Label + value display
- Props: label, value, style
- Used in: Network status, Details sections

#### ProgressBar
- Progress visualization
- Props: percentage, showPercentage, style
- Used in: Health metrics, Staking progress

#### List
- Wrapper for list of items
- Props: data, renderItem, keyExtractor, style

#### Toast
- Notification/alert component
- Types: success, error, warning, info
- Props: message, type, duration

#### Modal
- Dialog/overlay component
- Props: visible, children, onDismiss, style

#### Container
- Main content wrapper
- Props: children, style
- Applies padding and background

### Organisms (Complex Components)

#### LoadingView
- Full screen loading state
- Props: message, style
- Shows spinner with optional text

#### ErrorView
- Error state display
- Props: error, onRetry, style
- Shows error message and retry button

#### ErrorBoundary
- Error catching wrapper
- Props: children, fallback
- Catches child component errors

#### EmptyState
- Empty list state display
- Props: icon, title, description, action
- Used when no data available

## Component Usage Guidelines

### When to Create New Atoms
- Single, reusable UI element
- Used across multiple screens
- No internal state management
- Pure presentational

### When to Create New Molecules
- Combination of 2+ atoms
- Specific layout pattern
- Limited internal logic
- Reusable across screens

### When to Create New Organisms
- Complex multi-step interactions
- Significant internal state
- Screen-level components
- Error handling boundaries

## Styling System

### Design Tokens Integration
All components use centralized design tokens from `src/theme/tokens.ts`:
- Colors: Primary brand, semantic, backgrounds, text
- Spacing: Consistent gap/padding scale
- Typography: Font sizes, weights, line heights
- Border radius: Consistent roundness
- Shadows: Elevation levels

### Component Style Props
All components accept optional `style` prop for overrides while maintaining design system compliance.
