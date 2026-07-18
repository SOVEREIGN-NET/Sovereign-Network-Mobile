import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { HeaderBar, Text } from '../components';
import { mockDAOs } from '../services/SovSwapMockData';
import {
  sovswapAccentFor,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from './sovswap/theme/sovswapTokens';
import type { SovOrgType } from '../types/sovSwap';
import { colors, spacing, typography, borderRadius } from '../theme/tokens';
import TokenCreatorScreen from './TokenCreatorScreen';

type Mode = null | 'new-dao' | 'claim-domain' | 'create-token';
type WelfareSector = 'health' | 'education' | 'housing' | 'food';

interface TokenomicsTemplate {
  id: string;
  name: string;
  supply: number;
  price: number;
  burn: number;
  description: string;
  tagline: string;
}

const FOR_PROFIT_TEMPLATES: TokenomicsTemplate[] = [
  { id: 'unicorn', name: 'Unicorn', supply: 1_000_000_000, price: 0.01, burn: 0, description: 'Consumer apps, viral growth', tagline: '1B supply · $0.01' },
  { id: 'balanced', name: 'Balanced', supply: 10_000_000, price: 1, burn: 0, description: 'General businesses', tagline: '10M supply · $1.00' },
  { id: 'high-value', name: 'High Value', supply: 100_000, price: 100, burn: 0, description: 'Investment DAOs', tagline: '100K supply · $100' },
  { id: 'elephant', name: 'Elephant', supply: 1_000_000_000_000, price: 0.000001, burn: 0, description: 'Global conglomerates', tagline: '1T supply · $0.000001' },
  { id: 'deflationary', name: 'Deflationary', supply: 50_000_000, price: 0.5, burn: 2.5, description: '2.5% burn per tx', tagline: '50M supply · 2.5% burn' },
  { id: 'network', name: 'Network', supply: 500_000_000, price: 0.05, burn: 0.5, description: 'Utility velocity token', tagline: '500M supply · 0.5% burn' },
];

const NON_PROFIT_TEMPLATES: TokenomicsTemplate[] = [
  { id: 'grassroots', name: 'Grassroots', supply: 100_000_000, price: 0, burn: 0, description: 'Wide distribution', tagline: '100M supply' },
  { id: 'foundation', name: 'Foundation', supply: 1_000_000, price: 0, burn: 0, description: 'Established charities', tagline: '1M supply' },
  { id: 'council', name: 'Council', supply: 10_000, price: 0, burn: 0, description: 'Expert committees', tagline: '10K supply' },
  { id: 'global-fund', name: 'Global Fund', supply: 10_000_000_000, price: 0, burn: 0, description: 'International aid', tagline: '10B supply' },
  { id: 'regenerative', name: 'Regenerative', supply: 50_000_000, price: 0, burn: 1.5, description: 'Carbon-offset burn', tagline: '50M · 1.5% burn' },
  { id: 'rapid-relief', name: 'Rapid Relief', supply: 1_000_000_000, price: 0, burn: 0.1, description: 'Crisis distribution', tagline: '1B · 0.1% burn' },
];

const SECTORS: { id: WelfareSector; label: string; suffix: string; symbol: string }[] = [
  { id: 'health', label: 'Health', suffix: 'heal', symbol: 'HEAL' },
  { id: 'education', label: 'Education', suffix: 'edu', symbol: 'EDU' },
  { id: 'housing', label: 'Housing', suffix: 'home', symbol: 'HOME' },
  { id: 'food', label: 'Food', suffix: 'food', symbol: 'FOOD' },
];

const sanitizeDomain = (raw: string) =>
  raw.toLowerCase().replace(/[^a-z0-9-]/g, '');

export const RegisterDaoScreen: React.FC<any> = ({ navigation }) => {
  const [mode, setMode] = useState<Mode>(null);

  const renderContent = () => {
    if (mode === null) {
      return <PickerStep onPick={setMode} />;
    }
    if (mode === 'new-dao') {
      return <NewDaoForm onBack={() => setMode(null)} />;
    }
    if (mode === 'create-token') {
      return <TokenCreatorScreen onClose={() => setMode(null)} hideHeader />;
    }
    return <ClaimDomainForm onBack={() => setMode(null)} />;
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title={
          mode === 'new-dao'
            ? 'New DAO'
            : mode === 'claim-domain'
            ? 'Claim Domain'
            : mode === 'create-token'
            ? 'Create Token'
            : 'Register DAO'
        }
        onBackPress={() => (mode ? setMode(null) : navigation.goBack())}
        showHamburger={false}
      />
      {renderContent()}
    </View>
  );
};

/* ─── Picker step ─────────────────────────────────────────────────── */

const PickerStep: React.FC<{ onPick: (m: Mode) => void }> = ({ onPick }) => {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.pickerIntro}>
        <Text variant="h2" style={{ marginBottom: spacing.xs }}>Register New DAO</Text>
        <Text style={{ color: colors.text_secondary, fontSize: 14 }}>
          Launch a new organization. Note: Every DAO automatically includes a unique .sov domain and custom token.
        </Text>
      </View>

      <PickerCard
        title="Create New"
        subtitle="Launch a new organisation. Every DAO includes its own token and .sov domain as a bundle."
        chips={['Custom tokenomics', '.sov domain', 'Full governance']}
        cta="Get started"
        onPress={() => onPick('new-dao')}
      />
      <PickerCard
        title="Claim Domain"
        subtitle="Attach an existing token to a Sovereign domain and join the registry."
        chips={['Link existing token', '.sov identity', 'Join registry']}
        cta="Claim now"
        onPress={() => onPick('claim-domain')}
      />
      <PickerCard
        title="Token Creator"
        subtitle="Mint and manage custom ZK-tokens on the Sovereign Network."
        chips={['Custom supply', 'ZK-privacy', 'Instant mint']}
        cta="Create token"
        onPress={() => onPick('create-token')}
      />
    </ScrollView>
  );
};

interface PickerCardProps {
  title: string;
  subtitle: string;
  chips: string[];
  cta: string;
  onPress: () => void;
}

const PickerCard: React.FC<PickerCardProps> = ({
  title,
  subtitle,
  chips,
  cta,
  onPress,
}) => (
  <Pressable onPress={onPress} style={styles.pickerCard}>
    <View style={styles.pickerHeaderRow}>
      <Text style={styles.pickerTitle}>{title}</Text>
      <View style={styles.pickerArrow}>
        <Text style={styles.pickerArrowGlyph}>→</Text>
      </View>
    </View>
    <Text style={styles.pickerSubtitle}>{subtitle}</Text>
    <View style={styles.pickerChips}>
      {chips.map(c => (
        <View key={c} style={styles.pickerChip}>
          <Text style={styles.pickerChipText}>{c}</Text>
        </View>
      ))}
    </View>
    <View style={styles.pickerFooter}>
      <Text style={styles.pickerCta}>{cta}</Text>
    </View>
  </Pressable>
);

/* ─── New DAO form ────────────────────────────────────────────────── */

const NewDaoForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<SovOrgType>('for-profit');
  const [registerOfficial, setRegisterOfficial] = useState(false);
  const [sector, setSector] = useState<WelfareSector | null>(null);
  const [grantSeed, setGrantSeed] = useState('');
  const [domain, setDomain] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [templates, setTemplates] = useState<string>('balanced');
  const [customMode, setCustomMode] = useState(false);
  const [customSupply, setCustomSupply] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customBurn, setCustomBurn] = useState('');
  const [description, setDescription] = useState('');

  const templateList = type === 'for-profit'
    ? FOR_PROFIT_TEMPLATES
    : NON_PROFIT_TEMPLATES;

  React.useEffect(() => {
    setTemplates(type === 'for-profit' ? 'balanced' : 'foundation');
    setCustomMode(false);
    if (type === 'for-profit') {
      setRegisterOfficial(false);
      setSector(null);
    }
  }, [type]);

  const activeTemplate = useMemo(
    () => templateList.find(t => t.id === templates) ?? templateList[0],
    [templateList, templates],
  );

  const supply = customMode
    ? parseFloat(customSupply) || 0
    : activeTemplate.supply;
  const price = customMode
    ? parseFloat(customPrice) || 0
    : activeTemplate.price;
  const burn = customMode
    ? parseFloat(customBurn) || 0
    : activeTemplate.burn;

  const daoAlloc = type === 'for-profit' ? supply * 0.8 : 0;
  const treasuryAlloc = type === 'for-profit' ? supply * 0.2 : supply;
  const marketCap = type === 'for-profit' ? supply * price : 0;

  const domainSuffix =
    type === 'non-profit' && registerOfficial && sector
      ? `.${SECTORS.find(s => s.id === sector)?.suffix}.sov`
      : '.sov';

  const fullDomain = `${sanitizeDomain(domain) || 'my-dao'}${domainSuffix}`;

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Please enter an organisation name.');
      return;
    }
    Alert.alert(
      'DAO charter filed',
      `${name} has been registered with token $${tokenSymbol || 'NEW'} at ${fullDomain}.`,
      [{ text: 'OK', onPress: onBack }],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {/* §1 Name */}
      <FormSection title="Organisation Name">
        <UnderlineField
          value={name}
          onChangeText={setName}
          placeholder="Sovereign Coffee Cooperative"
        />
      </FormSection>

      {/* §2 Type */}
      <FormSection title="Organisation Type">
        <TypeRadio current={type} onChange={setType} value="for-profit" />
        <TypeRadio current={type} onChange={setType} value="non-profit" />
      </FormSection>

      {/* §2a Welfare sector for non-profit */}
      {type === 'non-profit' ? (
        <FormSection title="Sovereign Welfare Sector">
          <Pressable
            style={styles.checkRow}
            onPress={() => setRegisterOfficial(v => !v)}
          >
            <View style={[
              styles.checkbox,
              registerOfficial ? styles.checkboxOn : null,
            ]} />
            <Text style={styles.checkLabel}>
              Register as official Sovereign Network DAO (funded)
            </Text>
          </Pressable>

          {registerOfficial ? (
            <View style={styles.sectorWrap}>
              <Text style={styles.smallNote}>SELECT SECTOR</Text>
              <View style={styles.sectorGrid}>
                {SECTORS.map(s => {
                  const active = sector === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setSector(s.id)}
                      style={[styles.sectorCell, active ? styles.sectorActive : null]}
                    >
                      <Text style={[styles.sectorLabel, active ? styles.sectorLabelActive : null]}>
                        {s.label}
                      </Text>
                      <Text style={[styles.sectorSymbol, active ? styles.sectorSymbolActive : null]}>
                        ${s.symbol}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.smallNote}>OFFICIAL SOV GRANT SEEDPHRASE</Text>
              <UnderlineField
                value={grantSeed}
                onChangeText={setGrantSeed}
                placeholder="••••• ••••• •••••"
                secureTextEntry
              />
            </View>
          ) : null}
        </FormSection>
      ) : null}

      {/* §3 Domain */}
      <FormSection title="Collect Your Domain">
        <View style={styles.domainRow}>
          <UnderlineField
            value={domain}
            onChangeText={t => setDomain(sanitizeDomain(t))}
            placeholder="my-dao"
            style={styles.domainInput}
          />
          <Text style={styles.domainSuffix}>{domainSuffix}</Text>
        </View>
        <Text style={styles.preview}>
          Full domain: <Text style={styles.previewMono}>{fullDomain}</Text>
        </Text>
      </FormSection>

      {/* §4 Token name + symbol */}
      <FormSection title="Token Identity">
        <Text style={styles.smallNote}>TOKEN NAME</Text>
        <UnderlineField
          value={tokenName}
          onChangeText={setTokenName}
          placeholder="Sovereign Coffee Token"
        />
        <Text style={[styles.smallNote, { marginTop: sovswapSpacing.md }]}>
          TOKEN SYMBOL · MAX 6
        </Text>
        <UnderlineField
          value={tokenSymbol}
          onChangeText={t => setTokenSymbol(t.toUpperCase().slice(0, 6))}
          placeholder="COFFEE"
        />
      </FormSection>

      {/* §5 Tokenomics */}
      <FormSection title="Tokenomics Model">
        <View style={styles.templateGrid}>
          {templateList.map(t => {
            const active = templates === t.id && !customMode;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  setTemplates(t.id);
                  setCustomMode(false);
                }}
                style={[styles.templateCell, active ? styles.templateActive : null]}
              >
                <Text style={[styles.templateName, active ? styles.templateNameActive : null]}>
                  {t.name}
                </Text>
                <Text style={styles.templateTag}>{t.tagline}</Text>
                <Text style={styles.templateDesc} numberOfLines={2}>
                  {t.description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={styles.checkRow}
          onPress={() => setCustomMode(v => !v)}
        >
          <View style={[styles.checkbox, customMode ? styles.checkboxOn : null]} />
          <Text style={styles.checkLabel}>Create custom model</Text>
        </Pressable>

        {customMode ? (
          <View style={styles.customWrap}>
            <Text style={styles.smallNote}>TOTAL SUPPLY · MIN 1,000</Text>
            <UnderlineField
              value={customSupply}
              onChangeText={setCustomSupply}
              placeholder="1000000"
              keyboardType="numeric"
            />
            {type === 'for-profit' ? (
              <>
                <Text style={[styles.smallNote, { marginTop: sovswapSpacing.md }]}>
                  INITIAL PRICE ($SOV)
                </Text>
                <UnderlineField
                  value={customPrice}
                  onChangeText={setCustomPrice}
                  placeholder="1.00"
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}
            <Text style={[styles.smallNote, { marginTop: sovswapSpacing.md }]}>
              BURN RATE % · 0–100
            </Text>
            <UnderlineField
              value={customBurn}
              onChangeText={setCustomBurn}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </View>
        ) : null}
      </FormSection>

      {/* §6 Description */}
      <FormSection title="Description / Mission Statement">
        <TextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="State the purpose of the organisation."
          placeholderTextColor={colors.text_tertiary}
          style={styles.textarea}
        />
      </FormSection>

      {/* §7 Distribution preview */}
      <FormSection title="Token Distribution">
        <PreviewLine label="Initial Supply" value={`${supply.toLocaleString()} tokens`} />
        <PreviewLine
          label={`DAO receives (${type === 'for-profit' ? '80%' : '0%'})`}
          value={`${daoAlloc.toLocaleString()} tokens`}
        />
        <PreviewLine
          label={`Sovereign Treasury (${type === 'for-profit' ? '20%' : '100%'})`}
          value={`${treasuryAlloc.toLocaleString()} tokens`}
        />
        {type === 'for-profit' ? (
          <PreviewLine
            label="Initial Market Cap"
            value={`${marketCap.toLocaleString()} $SOV`}
          />
        ) : (
          <PreviewLine label="Staking APY" value="12.5% (fixed)" />
        )}
        {burn > 0 ? <PreviewLine label="Burn Rate" value={`${burn}% per tx`} /> : null}
      </FormSection>

      <Pressable onPress={handleSubmit} style={styles.submitBtn}>
        <Text style={styles.submitText}>CREATE DAO & LAUNCH TOKEN →</Text>
      </Pressable>
    </ScrollView>
  );
};

/* ─── Claim domain form ───────────────────────────────────────────── */

const ClaimDomainForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [daoId, setDaoId] = useState<number>(mockDAOs[0].id);
  const [orgName, setOrgName] = useState('');
  const [domain, setDomain] = useState('');
  const [contract, setContract] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('');
  const [description, setDescription] = useState('');
  const [picker, setPicker] = useState(false);

  const selectedDao = mockDAOs.find(d => d.id === daoId);
  const fullDomain = `${sanitizeDomain(domain) || 'my-org'}.${selectedDao?.tokenSymbol.toLowerCase()}.sov`;

  const submit = () => {
    Alert.alert(
      'Domain claimed',
      `${fullDomain} now points to ${orgName || 'your organisation'}.`,
      [{ text: 'OK', onPress: onBack }],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <FormSection title="Existing DAO">
        <Pressable style={styles.daoPicker} onPress={() => setPicker(true)}>
          <Text style={styles.daoPickerLabel}>SELECT</Text>
          <Text style={styles.daoPickerValue}>
            {selectedDao
              ? `${selectedDao.name} · $${selectedDao.tokenSymbol}`
              : 'pick a DAO'}
          </Text>
          <Text style={styles.daoPickerArrow}>▾</Text>
        </Pressable>
      </FormSection>

      <FormSection title="Organisation / Website Name">
        <UnderlineField
          value={orgName}
          onChangeText={setOrgName}
          placeholder="Acme Coffee Roasters"
        />
      </FormSection>

      <FormSection title="Your Domain Name">
        <View style={styles.domainRow}>
          <UnderlineField
            value={domain}
            onChangeText={t => setDomain(sanitizeDomain(t))}
            placeholder="my-org"
            style={styles.domainInput}
          />
          <Text style={styles.domainSuffix}>
            .{selectedDao?.tokenSymbol.toLowerCase()}.sov
          </Text>
        </View>
        <Text style={styles.preview}>
          Full domain: <Text style={styles.previewMono}>{fullDomain}</Text>
        </Text>
      </FormSection>

      <FormSection title="Existing Token Contract Address">
        <TextInput
          value={contract}
          onChangeText={setContract}
          placeholder="0x…"
          placeholderTextColor={colors.text_tertiary}
          style={[styles.textarea, styles.mono]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </FormSection>

      <FormSection title="Token Symbol · max 6">
        <UnderlineField
          value={symbol}
          onChangeText={t => setSymbol(t.toUpperCase().slice(0, 6))}
          placeholder="COFFEE"
        />
      </FormSection>

      <FormSection title="Current Token Supply">
        <UnderlineField
          value={supply}
          onChangeText={setSupply}
          placeholder="1000000"
          keyboardType="numeric"
        />
      </FormSection>

      <FormSection title="Organisation Description">
        <TextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="Describe your organisation."
          placeholderTextColor={colors.text_tertiary}
          style={styles.textarea}
        />
      </FormSection>

      <View style={styles.feeCard}>
        <Text style={styles.feeKicker}>REGISTRATION FEE</Text>
        <Text style={styles.feeValue}>100 $SOV</Text>
        <Text style={styles.feeNote}>One-time, non-refundable.</Text>
      </View>

      <Pressable onPress={submit} style={styles.submitBtn}>
        <Text style={styles.submitText}>CLAIM DOMAIN →</Text>
      </Pressable>

      {/* Tiny dropdown impl: scrim with list */}
      {picker ? (
        <Pressable style={styles.pickerScrim} onPress={() => setPicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            {mockDAOs.map(d => (
              <Pressable
                key={d.id}
                onPress={() => {
                  setDaoId(d.id);
                  setPicker(false);
                }}
                style={[
                  styles.pickerItem,
                  d.id === daoId ? styles.pickerItemActive : null,
                ]}
              >
                <Text style={styles.pickerItemSymbol}>${d.tokenSymbol}</Text>
                <Text style={styles.pickerItemName}>{d.name}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      ) : null}
    </ScrollView>
  );
};

/* ─── Form helpers ────────────────────────────────────────────────── */

const FormSection: React.FC<{
  title: string;
  children?: React.ReactNode;
}> = ({ title, children }) => (
  <View style={styles.formSection}>
    <Text style={styles.formTitle}>{title}</Text>
    <View style={styles.formBody}>{children}</View>
  </View>
);

const UnderlineField: React.FC<
  React.ComponentProps<typeof TextInput> & { style?: any }
> = ({ style, ...props }) => (
  <TextInput
    {...props}
    placeholderTextColor={colors.text_tertiary}
    style={[styles.underline, style]}
  />
);

const TypeRadio: React.FC<{
  value: SovOrgType;
  current: SovOrgType;
  onChange: (v: SovOrgType) => void;
}> = ({ value, current, onChange }) => {
  const accent = sovswapAccentFor(value);
  const active = current === value;
  const blurb =
    value === 'for-profit'
      ? '20% to Sovereign Treasury · 80% to your DAO'
      : '100% to Treasury · funded via $SOV staking';
  return (
    <Pressable
      style={[styles.radioCard, active ? styles.radioActive : null]}
      onPress={() => onChange(value)}
    >
      <View style={[
        styles.radioDot,
        active ? { backgroundColor: accent.accent, borderColor: accent.accent } : { borderColor: colors.border },
      ]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.radioTitle, active ? { color: accent.accent } : { color: colors.text_primary }]}>
          {accent.label}
        </Text>
        <Text style={styles.radioBlurb}>{blurb}</Text>
      </View>
    </Pressable>
  );
};

const PreviewLine: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={styles.previewLine}>
    <Text style={styles.previewLabel}>{label}</Text>
    <Text style={styles.previewValue}>{value}</Text>
  </View>
);

/* ─── Styles ──────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg_darkest },
  scroll: { paddingBottom: spacing.xxxl },
  pickerIntro: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  pickerCard: {
    backgroundColor: colors.bg_dark,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text_primary,
    flex: 1,
    paddingRight: spacing.sm,
  },
  pickerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerArrowGlyph: {
    color: colors.bg_darkest,
    fontSize: 16,
    fontWeight: '700',
  },
  pickerSubtitle: {
    fontSize: 13,
    color: colors.text_secondary,
    lineHeight: 18,
    marginTop: 6,
  },
  pickerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  },
  pickerChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.bg_darker,
  },
  pickerChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text_secondary,
    textTransform: 'uppercase',
  },
  pickerFooter: {
    marginTop: spacing.md,
    alignItems: 'flex-end',
  },
  pickerCta: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },

  formSection: {
    backgroundColor: colors.bg_dark,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  formBody: {},

  underline: {
    fontSize: 16,
    color: colors.text_primary,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    marginVertical: 2,
    borderRadius: borderRadius.sm,
  },
  radioActive: {
    backgroundColor: colors.bg_darker,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  radioTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  radioBlurb: {
    fontSize: 12,
    color: colors.text_secondary,
    fontStyle: 'italic',
    marginTop: 2,
  },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkLabel: {
    fontSize: 13,
    color: colors.text_primary,
  },

  sectorWrap: { paddingTop: spacing.xs },
  sectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  sectorCell: {
    width: '47%',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  sectorActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sectorLabel: { fontSize: 11, fontWeight: '700', color: colors.text_primary, textTransform: 'uppercase' },
  sectorLabelActive: { color: colors.bg_darkest },
  sectorSymbol: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
    color: colors.text_secondary,
  },
  sectorSymbolActive: { color: colors.bg_darkest },
  smallNote: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },

  domainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  domainInput: { flex: 1 },
  domainSuffix: {
    fontSize: 14,
    color: colors.text_tertiary,
    paddingBottom: 6,
    paddingLeft: 4,
  },
  preview: {
    fontSize: 12,
    color: colors.text_secondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  previewMono: {
    color: colors.primary,
    fontStyle: 'normal',
    fontWeight: '700',
  },

  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  templateCell: {
    width: '47%',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.bg_darker,
    borderRadius: borderRadius.sm,
  },
  templateActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
  },
  templateNameActive: { color: colors.bg_darkest },
  templateTag: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '700',
    color: colors.text_secondary,
  },
  templateDesc: {
    fontSize: 11,
    color: colors.text_tertiary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },

  customWrap: {
    paddingTop: spacing.sm,
  },

  textarea: {
    fontSize: 15,
    color: colors.text_primary,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    minHeight: 96,
    backgroundColor: colors.bg_darker,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    textAlignVertical: 'top',
  },
  mono: {
    fontFamily: 'Courier',
  },

  previewLine: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text_primary,
  },

  submitBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
  },
  submitText: {
    color: colors.bg_darkest,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 13,
  },

  feeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bg_dark,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feeKicker: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text_tertiary,
    textTransform: 'uppercase',
  },
  feeValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text_primary,
    marginTop: 4,
  },
  feeNote: {
    fontSize: 12,
    color: colors.text_secondary,
    fontStyle: 'italic',
    marginTop: 4,
  },

  daoPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  daoPickerLabel: { fontSize: 10, fontWeight: '700', color: colors.text_tertiary, textTransform: 'uppercase' },
  daoPickerValue: { flex: 1, fontSize: 14, color: colors.text_primary, fontStyle: 'italic' },
  daoPickerArrow: {
    fontSize: 12,
    color: colors.text_tertiary,
  },

  pickerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pickerSheet: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pickerItemActive: { backgroundColor: colors.bg_darker },
  pickerItemSymbol: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  pickerItemName: { fontSize: 14, color: colors.text_primary, fontStyle: 'italic' },
});

export default RegisterDaoScreen;
