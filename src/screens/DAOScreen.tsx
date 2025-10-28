import React from 'react';
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
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing } from '../theme';

const DAOScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { data, loading } = useAsyncData(
    async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 600));
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

  return (
    <ScrollView
      testID="dao-screen"
      style={{
        flex: 1,
        backgroundColor: colors.bg_dark,
        padding: spacing.lg,
      }}
    >
      {/* DAO Statistics */}
      {daoStats && (
        <Card spacing="xl">
          <Text variant="h3">{t.dao.statistics.title}</Text>
          <Column gap="lg" style={{ marginTop: spacing.lg }}>
            {/* Row 1 */}
            <Column
              gap="lg"
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <StatBox
                label={t.dao.statistics.members}
                value={daoStats.totalMembers?.toString() || '0'}
                style={{ flex: 1 }}
              />
              <StatBox
                label={t.dao.statistics.active}
                value={daoStats.activeProposals?.toString() || '0'}
                style={{ flex: 1 }}
              />
            </Column>
            {/* Row 2 */}
            <Column
              gap="lg"
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <StatBox
                label={t.dao.statistics.total}
                value={daoStats.totalProposals?.toString() || '0'}
                style={{ flex: 1 }}
              />
              <StatBox
                label={t.dao.statistics.treasury}
                value={(daoStats.treasuryBalance || 0).toLocaleString()}
                style={{ flex: 1 }}
              />
            </Column>
          </Column>
        </Card>
      )}

      {/* Proposals List */}
      <Card>
        <Text variant="h3">{t.dao.proposals.title}</Text>
        <Column gap="lg" style={{ marginTop: spacing.lg }}>
          {proposals.map(proposal => (
            <Card
              key={proposal.id}
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.lg,
              }}
              spacing="sm"
            >
              <Text variant="h3" style={{ marginBottom: spacing.lg }}>
                 {proposal.title}
              </Text>
              <Badge
                variant="info"
                label={proposal.status}
                style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}
              />
              <Text variant="body" style={{ marginBottom: spacing.lg }}>
                {proposal.description}
              </Text>

              <Text
                variant="caption"
                style={{ color: colors.text_secondary, marginBottom: spacing.lg }}
              >
                {t.dao.proposals.votes
                  .replace('{votesFor}', proposal.votesFor.toString())
                  .replace('{votesAgainst}', proposal.votesAgainst.toString())
                  .replace('{votesAbstain}', proposal.votesAbstain.toString())}
              </Text>

              <Button
                onPress={() =>
                  navigation.navigate('ProposalDetail', { proposalId: proposal.id })
                }
                variant="secondary"
              >
                {t.dao.proposals.viewProposal}
              </Button>
            </Card>
          ))}
        </Column>
      </Card>
    </ScrollView>
  );
};

export default DAOScreen;
