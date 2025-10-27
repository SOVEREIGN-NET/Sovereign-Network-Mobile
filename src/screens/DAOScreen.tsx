import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  StatBox,
  Badge,
} from '../components';
import { useAsyncData } from '../hooks';
import MockDataService from '../services/MockDataService';
import { colors, spacing } from '../theme';
import { getProposalStatusColor, getCategoryIcon } from '../utils/colors';

const DAOScreen = () => {
  const [expandedProposalId, setExpandedProposalId] = useState<string | null>(null);

  const { data, loading } = useAsyncData(
    async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
      return {
        proposals: MockDataService.getProposals(),
        daoStats: MockDataService.getDAOStats(),
      };
    },
    [],
  );

  if (loading) {
    return <LoadingView />;
  }

  const proposals = data?.proposals || [];
  const daoStats = data?.daoStats;

  const handleVote = (proposalId: string, vote: 'yes' | 'no' | 'abstain') => {
    MockDataService.voteOnProposal(proposalId, vote);
  };

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: colors.bg_dark,
        padding: spacing.md,
      }}
    >
      {/* DAO Statistics */}
      {daoStats && (
        <Card>
          <Text variant="h3">📊 DAO Statistics</Text>
          <Column gap="md" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' }}>
            <StatBox label="Members" value={daoStats.totalMembers?.toString() || '0'} />
            <StatBox label="Active" value={daoStats.activeProposals?.toString() || '0'} />
            <StatBox label="Total" value={daoStats.totalProposals?.toString() || '0'} />
            <StatBox label="Treasury" value={(daoStats.treasuryBalance || 0).toLocaleString()} />
          </Column>
        </Card>
      )}

      {/* Proposals List */}
      <Card>
        <Text variant="h3">🗳️ Active Proposals</Text>
        <Column gap="md">
          {proposals.map(proposal => (
            <Card key={proposal.id} style={{ backgroundColor: colors.bg_darker }}>
              <Text variant="h3">{getCategoryIcon(proposal.category)} {proposal.title}</Text>
              <Badge variant="info" label={proposal.status} style={{ marginVertical: spacing.sm }} />
              <Text variant="body" style={{ marginBottom: spacing.sm }}>
                {proposal.description}
              </Text>

              {expandedProposalId === proposal.id && (
                <Column gap="sm" style={{ marginTop: spacing.md }}>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>
                    For: {proposal.votesFor} • Against: {proposal.votesAgainst} • Abstain:{' '}
                    {proposal.votesAbstain}
                  </Text>
                  <Column gap="xs">
                    <Button onPress={() => handleVote(proposal.id, 'yes')} variant="primary">
                      Vote For
                    </Button>
                    <Button onPress={() => handleVote(proposal.id, 'no')} variant="danger">
                      Vote Against
                    </Button>
                    <Button onPress={() => handleVote(proposal.id, 'abstain')} variant="outline">
                      Abstain
                    </Button>
                  </Column>
                </Column>
              )}

              <Button
                onPress={() =>
                  setExpandedProposalId(
                    expandedProposalId === proposal.id ? null : proposal.id,
                  )
                }
                variant="outline"
                style={{ marginTop: spacing.sm }}
              >
                {expandedProposalId === proposal.id ? 'Hide' : 'Vote'}
              </Button>
            </Card>
          ))}
        </Column>
      </Card>
    </ScrollView>
  );
};

export default DAOScreen;
