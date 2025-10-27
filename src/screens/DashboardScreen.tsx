import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import MockDataService, { NetworkStatus, DAOStats } from '../services/MockDataService';

const DashboardScreen = () => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [daoStats, setDaoStats] = useState<DAOStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load mock data
    const loadData = async () => {
      setLoading(true);
      try {
        // Simulate async data loading
        await new Promise(resolve => setTimeout(resolve, 800));

        setNetworkStatus(MockDataService.getNetworkStatus());
        setDaoStats(MockDataService.getDAOStats());
        setLoading(false);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00d4ff" />
        <Text style={styles.loadingText}>Loading ZHTP Dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🌐 Network Status</Text>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Status:</Text>
          <Text style={[styles.value, { color: networkStatus?.connected ? '#00ff00' : '#ff4444' }]}>
            {networkStatus?.connected ? '🟢 Connected' : '🔴 Offline'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Protocol:</Text>
          <Text style={styles.value}>{networkStatus?.protocol}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Nodes:</Text>
          <Text style={styles.value}>{networkStatus?.nodeCount}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Mesh Health:</Text>
          <View style={styles.healthBar}>
            <View style={[styles.healthFill, { width: `${networkStatus?.meshHealth}%` }]} />
          </View>
          <Text style={styles.value}>{networkStatus?.meshHealth}%</Text>
        </View>
      </View>

      {/* DAO Stats Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏛️ DAO Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{daoStats?.totalMembers}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{daoStats?.activeProposals}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{daoStats?.totalProposals}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{(daoStats?.treasuryBalance || 0).toLocaleString()}</Text>
            <Text style={styles.statLabel}>Treasury</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚡ Quick Actions</Text>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Send ZHTP</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Claim UBI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Vote on Proposal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Create Proposal</Text>
        </TouchableOpacity>
      </View>

      {/* About Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️ About</Text>
        <Text style={styles.aboutText}>
          ZHTP Web4 Mobile - Zero-Knowledge Hypertext Transfer Protocol
        </Text>
        <Text style={styles.aboutText}>Version 1.0.0 (Demo Mode)</Text>
        <Text style={styles.aboutText}>
          This is a frontend demonstration. No blockchain operations are executed.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    padding: 16,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00d4ff',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  label: {
    color: '#cccccc',
    fontSize: 14,
  },
  value: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  healthBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#2a2a3e',
    borderRadius: 3,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  healthFill: {
    height: '100%',
    backgroundColor: '#00ff00',
    borderRadius: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  statItem: {
    width: '48%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#0f0f1e',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00d4ff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  actionButton: {
    backgroundColor: '#16213e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    color: '#00d4ff',
    marginTop: 12,
    fontSize: 14,
  },
  aboutText: {
    color: '#cccccc',
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
});

export default DashboardScreen;
