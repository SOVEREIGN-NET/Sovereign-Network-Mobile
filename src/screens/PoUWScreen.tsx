import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ScreenLayout } from '../components';
import PoUWControls from '../components/molecules/PoUWControls';
import { colors, spacing, typography } from '../theme';

const PoUWScreen = ({ navigation }: any) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PoUW Rewards</Text>
        <View style={styles.placeholder} />
      </View>
      <ScreenLayout paddingTop={16}>
        <PoUWControls
          onPendingCountChange={count =>
            console.log('Pending receipts:', count)
          }
          refreshInterval={5000}
        />
      </ScreenLayout>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + 20,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg_dark,
  },
  backButton: {
    padding: spacing.sm,
  },
  backText: {
    color: colors.primary,
    fontSize: typography.size.md,
  },
  title: {
    color: colors.text_primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  placeholder: {
    width: 60,
  },
});

export default PoUWScreen;
