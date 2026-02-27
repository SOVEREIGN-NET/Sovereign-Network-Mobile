import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { usePoUW } from '../../hooks/usePoUW';
import { colors, spacing, typography, borderRadius } from '../../theme';

export interface PoUWControlsProps {
  onPendingCountChange?: (count: number) => void;
  refreshInterval?: number;
}

export function PoUWControls({
  onPendingCountChange,
  refreshInterval = 5000,
}: PoUWControlsProps): ReactNode {
  const {
    flush,
    getPendingCount,
    isAvailable,
    error,
    isLoading,
  } = usePoUW();
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const updatePending = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPending(count);
      setLastError(null);
      onPendingCountChange?.(count);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setLastError(message);
    }
  }, [getPendingCount, onPendingCountChange]);

  const handleFlush = useCallback(async () => {
    try {
      await flush();
      Alert.alert('Success', 'Receipts submitted to network!');
      await updatePending();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setLastError(message);
      Alert.alert('Flush Failed', message);
    }
  }, [flush, updatePending]);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    updatePending();
    const interval = setInterval(updatePending, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, updatePending]);

  // Initial load
  useEffect(() => {
    updatePending();
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          PoUW not available: {error.message}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isAvailable ? colors.success : colors.error },
            ]}
          />
          <Text style={styles.statusText}>
            {isAvailable ? 'PoUW Active' : 'PoUW Unavailable'}
          </Text>
        </View>

        <View style={styles.countSection}>
          <Text style={styles.countLabel}>Pending Receipts</Text>
          <View style={styles.countRow}>
            <Text style={styles.countValue}>{pending}</Text>
            {isLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
        </View>

        {lastError && <Text style={styles.errorText}>{lastError}</Text>}

        <View style={styles.buttonContainer}>
          <Pressable
            onPress={handleFlush}
            disabled={isLoading || !isAvailable || pending === 0}
            style={({ pressed }) => [
              styles.flushButton,
              (isLoading || !isAvailable || pending === 0) && styles.flushButtonDisabled,
              pressed && styles.flushButtonPressed,
            ]}
          >
            <Text style={styles.flushButtonText}>
              {pending > 0 ? `Submit Receipts (${pending})` : 'No Receipts'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How to earn SOV</Text>
        <Text style={styles.infoText}>
          • Browse Web4 sites{'\n'}• Each page load verifies content{'\n'}•
          Flush receipts to claim rewards
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
  },
  statusCard: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: {
    color: colors.text_primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  countSection: {
    backgroundColor: colors.bg_darker,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  countLabel: {
    color: colors.text_secondary,
    fontSize: typography.size.sm,
    marginBottom: spacing.xs,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countValue: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: typography.weight.bold,
  },
  buttonContainer: {
    marginTop: spacing.sm,
  },
  flushButton: {
    height: 40,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.text_secondary,
    backgroundColor: colors.bg_darker,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flushButtonDisabled: {
    opacity: 0.5,
  },
  flushButtonPressed: {
    opacity: 0.85,
  },
  flushButtonText: {
    color: colors.text_primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.sm,
    marginBottom: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    color: colors.text_primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.sm,
  },
  infoText: {
    color: colors.text_secondary,
    fontSize: typography.size.sm,
    lineHeight: 22,
  },
});

export default PoUWControls;
