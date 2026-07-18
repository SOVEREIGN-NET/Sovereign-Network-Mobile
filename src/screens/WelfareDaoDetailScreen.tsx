import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
  ScreenLayout,
  HeaderBar,
  Badge,
  Divider,
  LoadingView,
  ArrowIcon,
} from '../components';
import { colors, spacing, typography, borderRadius, shadows } from '../theme';
import { WELFARE_DAOS } from '../constants';
import { useAuth, useAsyncData, useUserTokenBalances } from '../hooks';

// Mock Proposal Interface
interface Proposal {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'passed' | 'failed';
  stage: 'preliminary' | 'active';
  votesFor: number;
  votesAgainst: number;
  supportCount?: number;
  supportThreshold?: number;
  endTime: number;
}

// Mock Representative Interface
interface Representative {
  did: string;
  name: string;
  username: string;
  bio: string;
  votesDelegated: number;
  verified: boolean;
  website?: string;
}

const WelfareDaoDetailScreen = ({ route, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { daoId } = route.params;
  const { currentIdentity } = useAuth();
  const dao = useMemo(() => WELFARE_DAOS.find(d => d.id === daoId), [daoId]);
  const { tokens } = useUserTokenBalances();

  // State for Liquid Democracy
  const [delegatedTo, setDelegatedTo] = useState<string | null>(null); // Global delegate
  const [proposalDelegations, setProposalDelegations] = useState<Record<string, string>>({}); // Per-proposal overrides
  const [isDelegating, setIsDelegating] = useState(false);
  const [isDelegatingSpecific, setIsDelegatingSpecific] = useState<string | null>(null); // proposalId if specific
  const [delegateAddress, setDelegateAddress] = useState('');
  const [selectedRep, setSelectedRep] = useState<Representative | null>(null);

  // Mocking my voting power
  // In liquid democracy: my power = 1 (me) + sum(delegations to me)
  const [delegationsToMe, setDelegationsToMe] = useState<string[]>([
    'did:zhtp:abc...123',
    'did:zhtp:xyz...789'
  ]);

  const votingPower = useMemo(() => {
    return 1 + delegationsToMe.length;
  }, [delegationsToMe]);

  const hubToken = useMemo(() =>
    tokens.find(t => t.token_id.toLowerCase() === dao?.tokenId.toLowerCase()),
    [tokens, dao]
  );

  const { data: proposals, loading: proposalsLoading } = useAsyncData(async () => {
    // Mock proposals
    return [
      {
        id: 'p1',
        title: 'Community Kitchen Equipment Upgrade',
        description: 'Buying new industrial ovens for the sector kitchen.',
        status: 'active',
        stage: 'preliminary',
        votesFor: 0,
        votesAgainst: 0,
        supportCount: 45,
        supportThreshold: 100,
        endTime: Date.now() + 86400000 * 5,
      },
      {
        id: 'p2',
        title: 'Weekly Farmers Market Subsidy',
        description: 'Lowering the cost of stalls for local producers.',
        status: 'active',
        stage: 'preliminary',
        votesFor: 0,
        votesAgainst: 0,
        supportCount: 88,
        supportThreshold: 100,
        endTime: Date.now() + 86400000 * 2,
      },
      {
        id: '1',
        title: `Expand ${dao?.name} community garden network`,
        description: 'Proposal to allocate treasury funds for 5 new urban farming sites.',
        status: 'active',
        stage: 'active',
        votesFor: 124,
        votesAgainst: 12,
        endTime: Date.now() + 86400000 * 3,
      },
      {
        id: '2',
        title: 'Quarterly Audit Report - Q3 2026',
        description: 'Review and approval of the financial transparency report.',
        status: 'passed',
        stage: 'active',
        votesFor: 450,
        votesAgainst: 5,
        endTime: Date.now() - 86400000,
      }
    ] as Proposal[];
  }, [dao]);

  const representatives: Representative[] = [
    { did: 'did:zhtp:rep1', name: 'Sovereign Watch', username: 'sov_watch', bio: 'Non-profit focused on governance transparency and accountability within the network hubs. We conduct weekly audits.', votesDelegated: 1240, verified: true, website: 'watch.sov' },
    { did: 'did:zhtp:rep2', name: 'Dr. Aris Thorne', username: 'athorne', bio: 'Expert in sustainable urban development and community-driven resource management with 15 years of experience.', votesDelegated: 850, verified: true, website: 'aris.sov' },
    { did: 'did:zhtp:rep3', name: 'Global Commons', username: 'gcommons', bio: 'International organization dedicated to the fair distribution of digital and physical resources.', votesDelegated: 2100, verified: true, website: 'commons.sov' },
  ];

  const handleDelegate = () => {
    if (!delegateAddress.startsWith('did:zhtp:') && delegateAddress.length < 10) {
      Alert.alert('Invalid Address', 'Please enter a valid SID / DID.');
      return;
    }

    if (isDelegatingSpecific) {
      setProposalDelegations(prev => ({ ...prev, [isDelegatingSpecific]: delegateAddress }));
      setIsDelegatingSpecific(null);
      Alert.alert('Success', `Proposal delegation set to ${delegateAddress}.`);
    } else {
      setDelegatedTo(delegateAddress);
      setIsDelegating(false);
    }

    setDelegateAddress('');
  };

  const handleRevoke = () => {
    Alert.alert(
      'Revoke Global Delegation',
      'Are you sure you want to take back your voting power?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => setDelegatedTo(null) }
      ]
    );
  };

  const handleRevokeSpecific = (proposalId: string) => {
    setProposalDelegations(prev => {
      const next = { ...prev };
      delete next[proposalId];
      return next;
    });
  };

  const handleVote = (proposal: Proposal, type: 'for' | 'against') => {
    const specificDelegate = proposalDelegations[proposal.id];
    const effectiveDelegate = specificDelegate || delegatedTo;

    if (specificDelegate) {
      Alert.alert('Specific Delegate Active', `This proposal is delegated to ${specificDelegate}. You can still vote directly here, which will override the specific delegate for ONLY this proposal and earn you 1 ${dao.symbol}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Vote Directly', onPress: () => {
          Alert.alert('Vote Recorded & Reward Earned', `You voted ${type} on "${proposal.title}" with ${votingPower} voting power, overriding your specific delegate. You have earned 1 ${dao.symbol} for participating!`);
        }}
      ]);
      return;
    }

    if (delegatedTo) {
      Alert.alert('Global Delegate Active', `Your vote is currently handled by ${delegatedTo}. You can still vote directly here, which will override the global delegate for this proposal and earn you 1 ${dao.symbol}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Vote Directly', onPress: () => {
          Alert.alert('Vote Recorded & Reward Earned', `You voted ${type} on "${proposal.title}" with ${votingPower} voting power. You have earned 1 ${dao.symbol} for participating!`);
        }}
      ]);
      return;
    }

    Alert.alert('Vote Recorded & Reward Earned', `You voted ${type} on "${proposal.title}" with ${votingPower} voting power. You have earned 1 ${dao.symbol} for participating!`);
  };

  if (!dao) return <LoadingView />;

  const accent = dao.color;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onBackPress={() => navigation.goBack()}
        showHamburger={false}
      />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="lg" style={{ paddingBottom: spacing.xl }}>

            {/* Header Card */}
            <Card style={[styles.headerCard, { borderColor: accent }]}>
              <View style={[styles.colorStripe, { backgroundColor: accent }]} />
              <Row align="center" gap="md">
                <View style={[styles.iconContainer, { backgroundColor: `${accent}22`, borderColor: accent }]}>
                  <Text style={{ color: accent, fontSize: 24, fontWeight: '800' }}>{dao.symbol.charAt(1)}</Text>
                </View>
                <Column style={{ flex: 1 }}>
                  <Text variant="h2">{dao.name}</Text>
                  <Text style={{ color: colors.text_secondary, fontSize: 14 }}>{dao.url}</Text>
                </Column>
              </Row>
              <Text style={styles.daoDesc}>{dao.desc}</Text>

              <Divider style={{ marginVertical: spacing.md, opacity: 0.3 }} />

              <Row justify="space-between">
                <Column>
                  <Text style={styles.statLabel}>My Voting Power</Text>
                  <Row align="center" gap="xs">
                    <Text style={[styles.statValue, { color: accent }]}>{votingPower}</Text>
                    <Text style={styles.statSub}>SID{votingPower > 1 ? 's' : ''}</Text>
                  </Row>
                </Column>
                <Column align="flex-end">
                  <Text style={styles.statLabel}>My Balance</Text>
                  <Text style={styles.statValue}>{hubToken?.balance ?? '0'} {dao.symbol}</Text>
                </Column>
              </Row>
            </Card>

            {/* Liquid Democracy / Delegation Section */}
            <Card style={styles.govCard}>
              <Text variant="h3" style={{ marginBottom: spacing.md }}>Liquid Democracy</Text>

              {delegatedTo ? (
                <View style={styles.delegatedBanner}>
                  <Column gap="xs" style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: colors.text_secondary }}>Status: VOTING DELEGATED</Text>
                    <Text style={{ fontWeight: '600', color: colors.text_primary }} numberOfLines={1}>
                      {delegatedTo}
                    </Text>
                  </Column>
                  <Button size="sm" variant="secondary" onPress={handleRevoke}>Revoke</Button>
                </View>
              ) : (
                <Column gap="md">
                  <Text style={{ fontSize: 13, color: colors.text_secondary, lineHeight: 18 }}>
                    You are voting directly. In a liquid democracy, you can delegate your vote (including any votes delegated to you) to someone you trust.
                  </Text>
                  <Button
                    variant="primary"
                    style={{ backgroundColor: accent }}
                    onPress={() => setIsDelegating(true)}
                  >
                    Delegate My Vote
                  </Button>
                </Column>
              )}

              {delegationsToMe.length > 0 && (
                <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text_tertiary, textTransform: 'uppercase', marginBottom: spacing.sm }}>
                    Delegated to You ({delegationsToMe.length})
                  </Text>
                  {delegationsToMe.map((did, idx) => (
                    <Text key={idx} style={{ fontSize: 11, color: colors.text_secondary, marginBottom: 4 }}>• {did}</Text>
                  ))}
                  <Text style={{ fontSize: 10, color: colors.text_tertiary, fontStyle: 'italic', marginTop: 4 }}>
                    Note: You can further delegate these votes to another representative.
                  </Text>
                </View>
              )}
            </Card>

            {/* Active Proposals Section */}
            <Column gap="md">
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Row justify="space-between" align="center">
                  <Text variant="h3">Active Proposals</Text>
                  <View style={{ backgroundColor: `${accent}33`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: accent }}>
                    <Text style={{ color: accent, fontSize: 10, fontWeight: 'bold' }}>EARN 1 {dao.symbol} PER VOTE</Text>
                  </View>
                </Row>
                <Text style={{ fontSize: 11, color: colors.text_tertiary, marginTop: 4 }}>Vetted ideas currently in voting</Text>
              </View>

              {proposalsLoading ? (
                <LoadingView />
              ) : (
                proposals?.filter(p => p.stage === 'active' && p.status === 'active').map(proposal => {
                  const specificDelegate = proposalDelegations[proposal.id];
                  return (
                    <Card key={proposal.id} style={styles.proposalCard}>
                      <Column gap="sm">
                        <Row justify="space-between" align="flex-start">
                          <Text style={[styles.proposalTitle, { flex: 1 }]}>{proposal.title}</Text>
                          {specificDelegate ? (
                            <TouchableOpacity onPress={() => handleRevokeSpecific(proposal.id)}>
                              <Badge label="DELEGATED" variant="warning" size="sm" />
                            </TouchableOpacity>
                          ) : delegatedTo ? (
                            <Badge label="FOLLOWING GLOBAL" variant="info" size="sm" />
                          ) : null}
                        </Row>

                        <Text style={styles.proposalDesc} numberOfLines={2}>{proposal.description}</Text>

                        {specificDelegate && (
                          <View style={styles.specificDelegateBox}>
                            <Text style={{ fontSize: 11, color: colors.text_tertiary }}>Delegated to: {specificDelegate}</Text>
                          </View>
                        )}

                        <Row gap="sm" style={{ marginTop: spacing.xs }}>
                          <View style={{ flex: 1, height: 6, backgroundColor: colors.bg_dark, borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{
                              width: `${(proposal.votesFor / (proposal.votesFor + proposal.votesAgainst)) * 100}%`,
                              height: '100%',
                              backgroundColor: colors.success
                            }} />
                          </View>
                          <Text style={{ fontSize: 10, color: colors.text_secondary }}>
                            {proposal.votesFor} For / {proposal.votesAgainst} Against
                          </Text>
                        </Row>

                        <Row gap="md" style={{ marginTop: spacing.sm }}>
                          <TouchableOpacity
                            style={[styles.voteBtn, { borderColor: colors.success }]}
                            onPress={() => handleVote(proposal, 'for')}
                          >
                            <Text style={{ color: colors.success, fontWeight: '700' }}>VOTE FOR</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.voteBtn, { borderColor: colors.error }]}
                            onPress={() => handleVote(proposal, 'against')}
                          >
                            <Text style={{ color: colors.error, fontWeight: '700' }}>VOTE AGAINST</Text>
                          </TouchableOpacity>
                        </Row>

                        <TouchableOpacity
                          style={styles.proposalDelegateBtn}
                          onPress={() => setIsDelegatingSpecific(proposal.id)}
                        >
                          <Text style={{ color: accent, fontSize: 12, fontWeight: '600' }}>
                            {specificDelegate ? 'Change Delegate' : 'Delegate This Proposal'}
                          </Text>
                        </TouchableOpacity>
                      </Column>
                    </Card>
                  );
                })
              )}
            </Column>

            {/* Preliminary Proposals Section */}
            <Column gap="md">
              <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.sm }}>
                <Column>
                  <Text variant="h3">Preliminary Proposals</Text>
                  <Text style={{ fontSize: 11, color: colors.text_tertiary }}>Community vetting stage</Text>
                </Column>
                <TouchableOpacity onPress={() => navigation.navigate('CreateProposal', { daoId })}>
                  <View style={{ backgroundColor: `${accent}22`, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: accent }}>
                    <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>+ SUBMIT NEW</Text>
                  </View>
                </TouchableOpacity>
              </Row>

              {proposalsLoading ? (
                <LoadingView />
              ) : (
                proposals?.filter(p => p.stage === 'preliminary').map(proposal => (
                  <Card key={proposal.id} style={styles.prelimProposalCard}>
                    <Column gap="sm">
                      <Text style={styles.proposalTitle}>{proposal.title}</Text>
                      <Text style={styles.proposalDesc} numberOfLines={2}>{proposal.description}</Text>

                      <Column gap="xs" style={{ marginTop: spacing.xs }}>
                        <Row justify="space-between" align="center">
                          <Text style={{ fontSize: 11, color: colors.text_secondary, fontWeight: '600' }}>
                            Support: {proposal.supportCount} / {proposal.supportThreshold}
                          </Text>
                          <Text style={{ fontSize: 10, color: colors.text_tertiary }}>
                            {Math.round((proposal.supportCount! / proposal.supportThreshold!) * 100)}% to Active Stage
                          </Text>
                        </Row>
                        <View style={{ height: 4, backgroundColor: colors.bg_dark, borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{
                            width: `${(proposal.supportCount! / proposal.supportThreshold!) * 100}%`,
                            height: '100%',
                            backgroundColor: accent
                          }} />
                        </View>
                      </Column>

                      <Button
                        size="sm"
                        variant="secondary"
                        style={{ marginTop: spacing.xs, borderColor: accent }}
                        onPress={() => Alert.alert('Support Recorded', `You have supported "${proposal.title}". When it reaches ${proposal.supportThreshold} support, it will move to the Active stage.`)}
                      >
                        <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>SUPPORT IDEA</Text>
                      </Button>
                    </Column>
                  </Card>
                ))
              )}
            </Column>

            {/* Representatives */}
            <Column gap="md">
              <Text variant="h3" style={{ paddingHorizontal: spacing.sm }}>Representatives</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: spacing.md }}>
                {representatives.map(rep => (
                  <TouchableOpacity key={rep.did} activeOpacity={0.9} onPress={() => setSelectedRep(rep)}>
                    <Card style={styles.repCard}>
                      <Row align="center" gap="sm" style={{ marginBottom: spacing.xs }}>
                        <View style={styles.repAvatar}>
                          <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{rep.name.charAt(0)}</Text>
                        </View>
                        <Column>
                          <Row align="center" gap="xxs">
                            <Text style={{ fontWeight: '700', fontSize: 14 }}>{rep.name}</Text>
                            {rep.verified && <Text style={{ color: colors.primary }}>✓</Text>}
                          </Row>
                          <Text style={{ fontSize: 11, color: colors.text_tertiary }}>@{rep.username}</Text>
                        </Column>
                      </Row>
                      <Text style={styles.repBio} numberOfLines={2}>{rep.bio}</Text>
                      <Text style={{ fontSize: 10, color: accent, fontWeight: '700', marginTop: spacing.sm }}>
                        {rep.votesDelegated} VOTES MANAGED
                      </Text>
                      <TouchableOpacity
                        style={[styles.repDelegateBtn, { backgroundColor: `${accent}22` }]}
                        onPress={() => {
                          setDelegateAddress(rep.did);
                          handleDelegate();
                        }}
                      >
                        <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>DELEGATE TO THEM</Text>
                      </TouchableOpacity>
                    </Card>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Column>

          </Column>
        </ScrollView>
      </ScreenLayout>

      {/* Delegate Modal (Shared for Global and Specific) */}
      <Modal
        visible={isDelegating || !!isDelegatingSpecific}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setIsDelegating(false);
          setIsDelegatingSpecific(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.delegateModal}>
            <Text variant="h2" style={{ marginBottom: spacing.sm }}>
              {isDelegatingSpecific ? 'Delegate Proposal' : 'Delegate Vote'}
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: 14, marginBottom: spacing.lg }}>
              {isDelegatingSpecific
                ? `Enter the SID or DID for this specific proposal in ${dao.name}.`
                : `Enter the SID or DID of the person or organization you want to manage your voting power in ${dao.name}.`
              }
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="did:zhtp:..."
              placeholderTextColor={colors.text_placeholder}
              value={delegateAddress}
              onChangeText={setDelegateAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Row gap="md" style={{ marginTop: spacing.xl }}>
              <Button style={{ flex: 1 }} variant="secondary" onPress={() => {
                setIsDelegating(false);
                setIsDelegatingSpecific(null);
                setDelegateAddress('');
              }}>Cancel</Button>
              <Button style={{ flex: 1, backgroundColor: accent }} onPress={handleDelegate}>Confirm</Button>
            </Row>
          </Card>
        </View>
      </Modal>

      {/* Representative Detail Modal */}
      <Modal
        visible={!!selectedRep}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRep(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedRep(null)}
        >
          <TouchableWithoutFeedback>
            <Card style={styles.repDetailModal}>
              <Row align="center" gap="md" style={{ marginBottom: spacing.lg }}>
                <View style={[styles.repAvatar, { width: 64, height: 64, borderRadius: 32 }]}>
                  <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 24 }}>
                    {selectedRep?.name.charAt(0)}
                  </Text>
                </View>
                <Column style={{ flex: 1 }}>
                  <Row align="center" gap="xs">
                    <Text variant="h2">{selectedRep?.name}</Text>
                    {selectedRep?.verified && <Text style={{ color: colors.primary, fontSize: 20 }}>✓</Text>}
                  </Row>
                  <Text style={{ color: colors.text_secondary }}>@{selectedRep?.username}</Text>
                </Column>
              </Row>

              <Text style={styles.repDetailBio}>{selectedRep?.bio}</Text>

              <View style={styles.repStatsBox}>
                <Column>
                  <Text style={styles.statLabel}>Votes Managed</Text>
                  <Text style={[styles.statValue, { color: accent }]}>{selectedRep?.votesDelegated}</Text>
                </Column>
                {selectedRep?.website && (
                  <TouchableOpacity
                    style={styles.repWebsiteLink}
                    onPress={() => {
                      setSelectedRep(null);
                      navigation.navigate('Browser', { url: `zhtp://${selectedRep.website}` });
                    }}
                  >
                    <Text style={styles.statLabel}>Website</Text>
                    <Row align="center" gap="xs">
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>{selectedRep.website}</Text>
                      <ArrowIcon direction="right" size={12} color={colors.primary} />
                    </Row>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.didLabel}>SID / DID</Text>
              <View style={styles.didBox}>
                <Text style={styles.didText} numberOfLines={1}>{selectedRep?.did}</Text>
              </View>

              <Button
                style={{ marginTop: spacing.xl, backgroundColor: accent }}
                onPress={() => {
                  if (selectedRep) {
                    setDelegateAddress(selectedRep.did);
                    handleDelegate();
                    setSelectedRep(null);
                  }
                }}
              >
                Delegate My Vote to Them
              </Button>
            </Card>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  headerCard: {
    marginHorizontal: spacing.sm,
    padding: spacing.xl,
    paddingTop: spacing.xl + 4,
    backgroundColor: colors.bg_darker,
    overflow: 'hidden',
    borderWidth: 1,
  },
  colorStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  daoDesc: {
    marginTop: spacing.md,
    color: colors.text_secondary,
    lineHeight: 20,
    fontSize: 14,
  },
  statLabel: {
    fontSize: 10,
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text_primary,
  },
  statSub: {
    fontSize: 12,
    color: colors.text_tertiary,
    fontWeight: '600',
    marginTop: 4,
  },
  govCard: {
    marginHorizontal: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.bg_dark,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  delegatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_darker,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proposalCard: {
    marginHorizontal: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.bg_darker,
  },
  prelimProposalCard: {
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proposalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text_primary,
  },
  proposalDesc: {
    fontSize: 13,
    color: colors.text_secondary,
    lineHeight: 18,
  },
  voteBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repCard: {
    width: 260,
    padding: spacing.md,
    backgroundColor: colors.bg_darker,
  },
  repAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg_medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repBio: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  repDelegateBtn: {
    marginTop: spacing.md,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  delegateModal: {
    padding: spacing.xl,
    backgroundColor: colors.bg_dark,
  },
  modalInput: {
    backgroundColor: colors.bg_darkest,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.text_primary,
    fontSize: 16,
  },
  specificDelegateBox: {
    backgroundColor: colors.bg_darkest,
    padding: spacing.xs,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proposalDelegateBtn: {
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
  repDetailModal: {
    width: '90%',
    padding: spacing.xl,
    backgroundColor: colors.bg_dark,
  },
  repDetailBio: {
    color: colors.text_secondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  repStatsBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.bg_darker,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.lg,
  },
  repWebsiteLink: {
    alignItems: 'flex-end',
  },
  didLabel: {
    fontSize: 10,
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  didBox: {
    backgroundColor: colors.bg_darkest,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  didText: {
    color: colors.text_tertiary,
    fontSize: 12,
    fontFamily: 'Courier',
  }
});

export default WelfareDaoDetailScreen;
