import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import MockDataService, { Proposal, DAOStats } from '../services/MockDataService';

const DAOScreen = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [daoStats, setDaoStats] = useState<DAOStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedProposalId, setExpandedProposalId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 600));
        setProposals(MockDataService.getProposals());
        setDaoStats(MockDataService.getDAOStats());
        setLoading(false);
      } catch (error) {
        console.error('Error loading DAO data:', error);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#00d4ff';
      case 'passed':
        return '#51cf66';
      case 'failed':
        return '#ff6b6b';
      case 'executed':
        return '#ffd43b';
      default:
        return '#cccccc';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'governance':
        return '🏛️';
      case 'funding':
        return '💰';
      case 'technical':
        return '⚙️';
      default:
        return '📋';
    }
  };

  const handleVote = (proposalId: string, vote: 'yes' | 'no' | 'abstain') => {
    MockDataService.voteOnProposal(proposalId, vote);
    console.log(`Voted ${vote} on proposal ${proposalId}`);
  };

  return (
    <ScrollView style={styles.container}>
      {/* DAO Statistics */}
      {daoStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 DAO Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{daoStats.totalMembers.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{daoStats.activeProposals}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{daoStats.totalProposals}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {(daoStats.treasuryBalance / 1000000).toFixed(1)}M
              </Text>
              <Text style={styles.statLabel}>Treasury</Text>
            </View>
          </View>
        </View>
      )}

      {/* Treasury Details */}
      {daoStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏦 Treasury</Text>
          <View style={styles.treasuryBox}>
            <View style={styles.treasuryRow}>
              <Text style={styles.treasuryLabel}>Total Balance:</Text>
              <Text style={styles.treasuryValue}>
                {(daoStats.treasuryBalance / 1000000).toFixed(2)}M ZHTP
              </Text>
            </View>
            <View style={styles.treasuryRow}>
              <Text style={styles.treasuryLabel}>Allocated:</Text>
              <Text style={styles.treasuryValue}>850,000 ZHTP</Text>
            </View>
            <View style={styles.treasuryRow}>
              <Text style={styles.treasuryLabel}>Available:</Text>
              <Text style={[styles.treasuryValue, { color: '#51cf66' }]}>
                {(daoStats.treasuryBalance - 850000).toLocaleString()} ZHTP
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Proposals */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🗳️ Proposals</Text>
        {proposals.length === 0 ? (
          <Text style={styles.emptyText}>No proposals yet</Text>
        ) : (
          <FlatList
            data={proposals}
            scrollEnabled={false}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View key={item.id}>
                <TouchableOpacity
                  style={styles.proposalHeader}
                  onPress={() =>
                    setExpandedProposalId(
                      expandedProposalId === item.id ? null : item.id
                    )
                  }
                >
                  <View style={styles.proposalHeaderLeft}>
                    <Text style={styles.proposalIcon}>{getCategoryIcon(item.category)}</Text>
                    <View style={styles.proposalTitleBox}>
                      <Text style={styles.proposalTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.proposalProposer}>by {item.proposer.slice(0, 20)}...</Text>
                    </View>
                  </View>
                  <Text style={[styles.proposalStatus, { color: getStatusColor(item.status) }]}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </TouchableOpacity>

                {expandedProposalId === item.id && (
                  <View style={styles.proposalDetails}>
                    <Text style={styles.proposalDescription}>{item.description}</Text>

                    <View style={styles.votingStats}>
                      <View style={styles.voteRow}>
                        <Text style={styles.voteLabel}>Yes</Text>
                        <View style={styles.voteBar}>
                          <View
                            style={[
                              styles.voteFill,
                              {
                                width: `${
                                  (item.votesFor /
                                    (item.votesFor + item.votesAgainst + item.votesAbstain)) *
                                  100
                                }%`,
                                backgroundColor: '#51cf66',
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.voteCount}>{item.votesFor}</Text>
                      </View>

                      <View style={styles.voteRow}>
                        <Text style={styles.voteLabel}>No</Text>
                        <View style={styles.voteBar}>
                          <View
                            style={[
                              styles.voteFill,
                              {
                                width: `${
                                  (item.votesAgainst /
                                    (item.votesFor + item.votesAgainst + item.votesAbstain)) *
                                  100
                                }%`,
                                backgroundColor: '#ff6b6b',
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.voteCount}>{item.votesAgainst}</Text>
                      </View>

                      <View style={styles.voteRow}>
                        <Text style={styles.voteLabel}>Abstain</Text>
                        <View style={styles.voteBar}>
                          <View
                            style={[
                              styles.voteFill,
                              {
                                width: `${
                                  (item.votesAbstain /
                                    (item.votesFor + item.votesAgainst + item.votesAbstain)) *
                                  100
                                }%`,
                                backgroundColor: '#ffd43b',
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.voteCount}>{item.votesAbstain}</Text>
                      </View>
                    </View>

                    <Text style={styles.endTimeText}>
                      Ends: {new Date(item.endTime).toLocaleDateString()}
                    </Text>

                    {item.status === 'active' && (
                      <View style={styles.votingButtons}>
                        <TouchableOpacity
                          style={[styles.voteButton, styles.voteYesButton]}
                          onPress={() => handleVote(item.id, 'yes')}
                        >
                          <Text style={styles.voteButtonText}>✓ Vote Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.voteButton, styles.voteNoButton]}
                          onPress={() => handleVote(item.id, 'no')}
                        >
                          <Text style={styles.voteButtonText}>✗ Vote No</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.voteButton, styles.voteAbstainButton]}
                          onPress={() => handleVote(item.id, 'abstain')}
                        >
                          <Text style={styles.voteButtonText}>~ Abstain</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>

      {/* Governance Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️ Governance</Text>
        <Text style={styles.infoText}>
          ZHTP DAO is a decentralized autonomous organization governing the Web4 network.
        </Text>
        <Text style={styles.infoText}>
          All members can propose and vote on protocol changes, funding allocations, and technical upgrades.
        </Text>
        <TouchableOpacity style={styles.createProposalButton}>
          <Text style={styles.createProposalButtonText}>+ Create Proposal</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1e', padding: 16 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#00d4ff', marginBottom: 12 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statBox: {
    width: '48%',
    backgroundColor: '#0f0f1e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#00d4ff', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#888888' },
  treasuryBox: { backgroundColor: '#0f0f1e', borderRadius: 8, padding: 12 },
  treasuryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  treasuryLabel: { fontSize: 14, color: '#cccccc' },
  treasuryValue: { fontSize: 14, fontWeight: '600', color: '#00d4ff' },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  proposalHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  proposalIcon: { fontSize: 18, marginRight: 12 },
  proposalTitleBox: { flex: 1 },
  proposalTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
  proposalProposer: { fontSize: 11, color: '#888888' },
  proposalStatus: { fontSize: 12, fontWeight: '600' },
  proposalDetails: {
    backgroundColor: '#0f0f1e',
    padding: 12,
    marginBottom: 8,
    borderRadius: 6,
  },
  proposalDescription: { color: '#cccccc', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  votingStats: { marginBottom: 12 },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  voteLabel: { width: 50, color: '#cccccc', fontSize: 12 },
  voteBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#2a2a3e',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  voteFill: { height: '100%', borderRadius: 4 },
  voteCount: { width: 40, textAlign: 'right', color: '#00d4ff', fontSize: 12, fontWeight: '600' },
  endTimeText: { color: '#888888', fontSize: 11, marginBottom: 12 },
  votingButtons: { flexDirection: 'row', gap: 8 },
  voteButton: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  voteYesButton: { backgroundColor: '#51cf66' },
  voteNoButton: { backgroundColor: '#ff6b6b' },
  voteAbstainButton: { backgroundColor: '#ffd43b' },
  voteButtonText: { color: '#000000', fontWeight: '600', fontSize: 12 },
  emptyText: { color: '#888888', textAlign: 'center', paddingVertical: 12 },
  infoText: { color: '#cccccc', fontSize: 13, marginBottom: 8, lineHeight: 18 },
  createProposalButton: {
    backgroundColor: '#16213e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  createProposalButtonText: { color: '#00d4ff', fontSize: 14, fontWeight: '600' },
});

export default DAOScreen;
