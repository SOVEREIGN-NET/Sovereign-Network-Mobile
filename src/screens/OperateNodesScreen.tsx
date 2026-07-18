import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Pressable,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderBar, Text } from '../components';
import { colors, spacing, borderRadius } from '../theme/tokens';

export const OperateNodesScreen: React.FC<any> = () => {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.container}>
      <HeaderBar
        title="Operate Nodes"
        onBackPress={() => navigation.goBack()}
        showHamburger={false}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Text variant="h2" style={{ marginBottom: spacing.xs }}>Node Operation</Text>
          <Text style={{ color: colors.text_secondary, fontSize: 14 }}>
            Download and deploy Sovereign Network node software to support the network.
          </Text>
        </View>

        <NodeCard
          title="Observer / Relay Node"
          subtitle="Maintain a full copy of the ledger and relay transactions without participating in consensus."
          chips={['Full Ledger', 'P2P Relay', 'Read-only']}
          cta="Download Software"
          onPress={() => Alert.alert('Download', 'Observer/Relay node software download started...')}
        />

        <NodeCard
          title="Validator Node"
          subtitle="Participate in network consensus, validate transactions, and earn rewards for securing the network."
          chips={['Consensus', 'Block Production', 'Earn Rewards']}
          cta="Download Software"
          onPress={() => Alert.alert('Download', 'Validator node software download started...')}
        />

        <NodeCard
          title="Storage Node"
          subtitle="Provide decentralized storage capacity to the network and host files for Web4 domains."
          chips={['File Hosting', 'Content Delivery', 'Storage Rewards']}
          cta="Download Software"
          onPress={() => Alert.alert('Download', 'Storage node software download started...')}
        />
      </ScrollView>
    </View>
  );
};

interface NodeCardProps {
  title: string;
  subtitle: string;
  chips: string[];
  cta: string;
  onPress: () => void;
}

const NodeCard: React.FC<NodeCardProps> = ({
  title,
  subtitle,
  chips,
  cta,
  onPress,
}) => (
  <Pressable onPress={onPress} style={styles.nodeCard}>
    <View style={styles.nodeHeaderRow}>
      <Text style={styles.nodeTitle}>{title}</Text>
      <View style={styles.nodeArrow}>
        <Text style={styles.nodeArrowGlyph}>↓</Text>
      </View>
    </View>
    <Text style={styles.nodeSubtitle}>{subtitle}</Text>
    <View style={styles.nodeChips}>
      {chips.map(c => (
        <View key={c} style={styles.nodeChip}>
          <Text style={styles.nodeChipText}>{c}</Text>
        </View>
      ))}
    </View>
    <View style={styles.nodeFooter}>
      <Text style={styles.nodeCta}>{cta}</Text>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg_darkest },
  scroll: { paddingBottom: spacing.xxxl },
  intro: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  nodeCard: {
    backgroundColor: colors.bg_dark,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nodeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text_primary,
    flex: 1,
    paddingRight: spacing.sm,
  },
  nodeArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeArrowGlyph: {
    color: colors.bg_darkest,
    fontSize: 16,
    fontWeight: '700',
  },
  nodeSubtitle: {
    fontSize: 13,
    color: colors.text_secondary,
    lineHeight: 18,
    marginTop: 6,
  },
  nodeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  },
  nodeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.bg_darker,
  },
  nodeChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text_secondary,
    textTransform: 'uppercase',
  },
  nodeFooter: {
    marginTop: spacing.md,
    alignItems: 'flex-end',
  },
  nodeCta: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },
});

export default OperateNodesScreen;
