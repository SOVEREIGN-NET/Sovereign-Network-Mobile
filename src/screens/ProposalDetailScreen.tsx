import React from 'react';
import { ScrollView } from 'react-native';
import { Card, Text, Button, Column, Badge, ProgressBar } from '../components';
import { colors, spacing } from '../theme';
import MockDataService from '../services/MockDataService';

const ProposalDetailScreen = ({ route, navigation }: any) => {
  const proposalId = route?.params?.proposalId;
  const proposals = MockDataService.getProposals();
  const proposal = proposals.find(p => p.id === proposalId) || proposals[0];

  const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  const forPercentage = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0;
  const againstPercentage = totalVotes > 0 ? (proposal.votesAgainst / totalVotes) * 100 : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg_dark, padding: spacing.lg }}>
      <Card>
        <Text variant="h2" style={{ marginBottom: spacing.md }}>
          {proposal.title}
        </Text>
        <Badge variant="info" label={proposal.status} style={{ marginBottom: spacing.md }} />
        <Text variant="body" style={{ color: colors.text_secondary, marginBottom: spacing.md }}>
          {proposal.description}
        </Text>

        <Column gap="md" style={{ marginTop: spacing.lg }}>
          <Text variant="h3">📊 Voting Results</Text>
          <Column gap="sm">
            <Text variant="body">For: {proposal.votesFor} votes ({forPercentage.toFixed(1)}%)</Text>
            <ProgressBar percentage={forPercentage} showPercentage={false} />

            <Text variant="body" style={{ marginTop: spacing.md }}>
              Against: {proposal.votesAgainst} votes ({againstPercentage.toFixed(1)}%)
            </Text>
            <ProgressBar percentage={againstPercentage} showPercentage={false} />

            <Text variant="body" style={{ marginTop: spacing.md }}>
              Abstain: {proposal.votesAbstain} votes
            </Text>
          </Column>

          <Column gap="sm" style={{ marginTop: spacing.lg }}>
            <Text variant="h3">🗳️ Your Vote</Text>
            <Button
              onPress={() => {
                MockDataService.voteOnProposal(proposal.id, 'yes');
                alert('Voted For');
              }}
              variant="primary"
            >
              Vote For
            </Button>
            <Button
              onPress={() => {
                MockDataService.voteOnProposal(proposal.id, 'no');
                alert('Voted Against');
              }}
              variant="danger"
            >
              Vote Against
            </Button>
            <Button
              onPress={() => {
                MockDataService.voteOnProposal(proposal.id, 'abstain');
                alert('Abstained');
              }}
              variant="outline"
            >
              Abstain
            </Button>
          </Column>

          <Button onPress={() => navigation.goBack()} variant="outline" style={{ marginTop: spacing.md }}>
            Back
          </Button>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default ProposalDetailScreen;
