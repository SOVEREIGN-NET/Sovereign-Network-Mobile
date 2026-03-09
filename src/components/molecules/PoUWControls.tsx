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
import { useRewardCounter } from '../../hooks/useRewardCounter';
import { colors, spacing, typography, borderRadius } from '../../theme';

function formatCountdown(maturesAt: number): string {
  const remaining = maturesAt - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return 'Eligible now';
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isMaturingError(e: unknown): boolean {
  const body = (e as any)?.body;
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  if (typeof obj.age_secs === 'number' && typeof obj.required_secs === 'number') return true;
  if (Array.isArray(obj.rejected)) {
    return obj.rejected.some(
      r => r && typeof r === 'object' &&
        typeof (r as any).age_secs === 'number' &&
        typeof (r as any).required_secs === 'number',
    );
  }
  return false;
}

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
    maturesAt: flushMaturesAt,
  } = usePoUW();

  // Also check rewards endpoint — gives us maturation state on screen open,
  // before the user ever attempts a flush.
  const { maturesAt: rewardsMaturesAt } = useRewardCounter();
  const maturesAt = rewardsMaturesAt ?? flushMaturesAt;
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  // Update countdown string every minute while maturing
  useEffect(() => {
    if (!maturesAt) {
      setCountdown(null);
      return;
    }
    setCountdown(formatCountdown(maturesAt));
    const timer = setInterval(() => {
      const label = formatCountdown(maturesAt);
      setCountdown(label);
    }, 60_000);
    return () => clearInterval(timer);
  }, [maturesAt]);

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
      // Maturation errors are shown via the countdown banner — skip the alert
      if (isMaturingError(e)) return;
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

  const isMaturing = countdown !== null && countdown !== 'Eligible now';

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
      {isMaturing && (
        <View style={styles.maturationCard}>
          <Text style={styles.maturationTitle}>Identity Maturing</Text>
          <Text style={styles.maturationSubtitle}>
            New identities earn PoUW rewards after a 24-hour maturation period.
          </Text>
          <Text style={styles.maturationCountdown}>
            Eligible in {countdown}
          </Text>
        </View>
      )}

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isMaturing ? colors.text_secondary : isAvailable ? colors.success : colors.error },
            ]}
          />
          <Text style={styles.statusText}>
            {isMaturing ? 'PoUW Maturing' : isAvailable ? 'PoUW Active' : 'PoUW Unavailable'}
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
            disabled={isLoading || !isAvailable || pending === 0 || isMaturing}
            style={({ pressed }) => [
              styles.flushButton,
              (isLoading || !isAvailable || pending === 0 || isMaturing) && styles.flushButtonDisabled,
              pressed && styles.flushButtonPressed,
            ]}
          >
            <Text style={styles.flushButtonText}>
              {isMaturing
                ? `Eligible in ${countdown}`
                : pending > 0
                  ? `Submit Receipts (${pending})`
                  : 'No Receipts'}
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
  maturationCard: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.text_secondary,
    gap: spacing.xs,
  },
  maturationTitle: {
    color: colors.text_primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  maturationSubtitle: {
    color: colors.text_secondary,
    fontSize: typography.size.sm,
  },
  maturationCountdown: {
    color: colors.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
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
