/**
 * PoUWControls Component
 * Phase 4: React Native Bridge for Proof-of-Useful-Work
 * 
 * Example component demonstrating PoUW integration.
 * Shows pending receipt count and provides controls for
 * content verification and flushing.
 * 
 * This is a reference implementation showing proper usage
 * of the usePoUW hook.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ViewStyle,
  TextStyle
} from 'react-native';
import { usePoUW } from '../../hooks/usePoUW';

export interface PoUWControlsProps {
  /**
   * Optional style for the container
   */
  style?: ViewStyle;
  
  /**
   * Called when pending count changes
   */
  onPendingCountChange?: (count: number) => void;
  
  /**
   * Auto-refresh interval for pending count (ms, 0 to disable)
   * @default 5000
   */
  refreshInterval?: number;
}

/**
 * Example content for demonstration purposes
 * In production, this would come from actual content
 */
const EXAMPLE_CONTENT_ID = new Uint8Array([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20
]);

const EXAMPLE_BYTES = new Uint8Array([
  0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57, // "Hello, W"
  0x6f, 0x72, 0x6c, 0x64, 0x21                      // "orld!"
]);

/**
 * PoUW Controls Component
 * 
 * Demonstrates:
 * - Content verification
 * - Receipt flushing
 * - Pending count display
 * - Error handling
 * - Loading states
 */
export function PoUWControls({
  style,
  onPendingCountChange,
  refreshInterval = 5000
}: PoUWControlsProps): JSX.Element {
  const { verifyContent, flush, getPendingCount, isAvailable, error, isLoading } = usePoUW();
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  
  /**
   * Update pending count
   */
  const updatePending = useCallback(async () => {
    if (!isAvailable) return;
    
    try {
      const count = await getPendingCount();
      setPending(count);
      setLastError(null);
      onPendingCountChange?.(count);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setLastError(message);
    }
  }, [isAvailable, getPendingCount, onPendingCountChange]);
  
  /**
   * Handle verify button press
   * 
   * In production, contentId and bytes would come from:
   * - Downloaded content
   * - Cache entries
   * - User-generated content
   */
  const handleVerify = useCallback(async () => {
    try {
      // Example: verify content with optional provider ID
      await verifyContent(EXAMPLE_CONTENT_ID, EXAMPLE_BYTES);
      Alert.alert('Success', 'Content verified and receipt queued');
      await updatePending();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setLastError(message);
      Alert.alert('Verification Failed', message);
    }
  }, [verifyContent, updatePending]);
  
  /**
   * Handle flush button press
   */
  const handleFlush = useCallback(async () => {
    try {
      await flush();
      Alert.alert('Success', 'Receipts submitted to network');
      await updatePending();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setLastError(message);
      Alert.alert('Flush Failed', message);
    }
  }, [flush, updatePending]);
  
  /**
   * Auto-refresh pending count
   */
  useEffect(() => {
    if (!isAvailable || refreshInterval <= 0) return;
    
    // Initial load
    updatePending();
    
    // Set up interval
    const interval = setInterval(updatePending, refreshInterval);
    return () => clearInterval(interval);
  }, [isAvailable, refreshInterval, updatePending]);
  
  // Show error if module not available
  if (error) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.errorText}>
          PoUW not available: {error.message}
        </Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>PoUW Controls</Text>
      
      {/* Pending Count Display */}
      <View style={styles.countContainer}>
        <Text style={styles.countLabel}>Pending Receipts:</Text>
        <Text style={styles.countValue}>{pending}</Text>
        {isLoading && <ActivityIndicator size="small" style={styles.loader} />}
      </View>
      
      {/* Error Display */}
      {lastError && (
        <Text style={styles.errorText}>{lastError}</Text>
      )}
      
      {/* Control Buttons */}
      <View style={styles.buttonContainer}>
        <Button
          title="Verify Content"
          onPress={handleVerify}
          disabled={isLoading || !isAvailable}
        />
        <View style={styles.buttonSpacer} />
        <Button
          title="Flush Receipts"
          onPress={handleFlush}
          disabled={isLoading || !isAvailable || pending === 0}
        />
      </View>
      
      {/* Status Indicator */}
      <Text style={styles.statusText}>
        {isAvailable ? 'PoUW Ready' : 'PoUW Unavailable'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    margin: 8
  } as ViewStyle,
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333'
  } as TextStyle,
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  } as ViewStyle,
  countLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8
  } as TextStyle,
  countValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333'
  } as TextStyle,
  loader: {
    marginLeft: 8
  } as ViewStyle,
  buttonContainer: {
    marginTop: 8
  } as ViewStyle,
  buttonSpacer: {
    height: 8
  } as ViewStyle,
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginBottom: 8
  } as TextStyle,
  statusText: {
    fontSize: 11,
    color: '#999',
    marginTop: 12,
    textAlign: 'center'
  } as TextStyle
});

export default PoUWControls;
