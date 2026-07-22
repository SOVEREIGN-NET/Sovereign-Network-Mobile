import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SovSectionHeader } from '../../../components/organisms/SovSwap';
import domainService, {
  DOMAIN_REGISTRATION_FEE_SOV,
} from '../../../services/DomainService';
import { useWalletList } from '../../../hooks/useWalletList';
import {
  sovswapAccentFor,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../theme/sovswapTokens';
import type { SovOrgType } from '../../../types/sovSwap';

type Mode = null | 'new-dao' | 'claim-domain';
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

/**
 * Create DAO tab — picker → form. The picker offers two paths
 * (new DAO vs. claim a domain for an existing DAO). Both forms keep
 * the same editorial spine: small-caps section labels, hairline
 * dividers, monospaced numeric previews so figures line up like a
 * register entry under review.
 */
export const CreateDaoTab: React.FC = () => {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === null) {
    return <PickerStep onPick={setMode} />;
  }
  if (mode === 'new-dao') {
    return <NewDaoForm onBack={() => setMode(null)} />;
  }
  return <ClaimDomainForm onBack={() => setMode(null)} />;
};

/* ─── Picker step ─────────────────────────────────────────────────── */

const PickerStep: React.FC<{ onPick: (m: Mode) => void }> = ({ onPick }) => {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.headerWrap}>
        <SovSectionHeader
          title="Create DAO"
          subtitle="Open a new entry in the registry, or attach a domain to an existing organisation."
        />
      </View>

      <PickerCard
        title="Create New"
        subtitle="Launch a new organisation with its own token and .sov domain."
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

  // Reset template when type flips, default to Balanced/Foundation
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
      <View style={styles.headerWrap}>
        <SovSectionHeader
          title="New DAO"
          subtitle="Fill in the details. Every field is binding upon registration."
          onBack={onBack}
        />
      </View>

      {/* §1 Name */}
      <FormSection no="§1" title="Organisation Name">
        <UnderlineField
          value={name}
          onChangeText={setName}
          placeholder="Sovereign Coffee Cooperative"
        />
      </FormSection>

      {/* §2 Type */}
      <FormSection no="§2" title="Organisation Type">
        <TypeRadio current={type} onChange={setType} value="for-profit" />
        <TypeRadio current={type} onChange={setType} value="non-profit" />
      </FormSection>

      {/* §2a Welfare sector for non-profit */}
      {type === 'non-profit' ? (
        <FormSection no="§2a" title="Sovereign Welfare Sector">
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
              <Text style={styles.smallNote}>
                Official sector registration is DID/keystore-signed (no seedphrase).
              </Text>
            </View>
          ) : null}
        </FormSection>
      ) : null}

      {/* §3 Domain */}
      <FormSection no="§3" title="Collect Your Domain">
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
      <FormSection no="§4" title="Token Identity">
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
      <FormSection no="§5" title="Tokenomics Model">
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
      <FormSection no="§6" title="Description / Mission Statement">
        <TextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="State the purpose of the organisation."
          placeholderTextColor={sovswapColors.paperInkFaint}
          style={styles.textarea}
        />
      </FormSection>

      {/* §7 Distribution preview */}
      <FormSection no="§7" title="Token Distribution">
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

/* ─── Claim domain form (M4: DomainRegistration after AssetLaunch) ── */

const ClaimDomainForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { walletByType } = useWalletList();
  const primaryWallet = walletByType?.primary;

  const [domain, setDomain] = useState('');
  /** Optional 64-char hex sovereign asset_id (V3 bind). Native display — no 0x. */
  const [assetId, setAssetId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const label = sanitizeDomain(domain);
  const fullDomain = label ? `${label}.sov` : 'my-org.sov';
  const assetIdNorm = assetId.replace(/^0x/i, '').trim().toLowerCase();
  const assetIdOk =
    assetIdNorm.length === 0 || /^[0-9a-f]{64}$/.test(assetIdNorm);

  const submit = async () => {
    if (!label) {
      Alert.alert('Missing domain', 'Enter a domain label (e.g. my-dao).');
      return;
    }
    if (!assetIdOk) {
      Alert.alert(
        'Invalid asset id',
        'asset_id must be 64 hex characters (native 32-byte id, no 0x required).',
      );
      return;
    }
    if (!primaryWallet?.id || String(primaryWallet.id).length !== 64) {
      Alert.alert(
        'Wallet required',
        'Primary wallet not found — unlock identity to pay the registration fee.',
      );
      return;
    }
    if ((primaryWallet.total_balance ?? 0) < DOMAIN_REGISTRATION_FEE_SOV) {
      Alert.alert(
        'Insufficient SOV',
        `Need ${DOMAIN_REGISTRATION_FEE_SOV} SOV to claim a domain.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await domainService.registerDomain({
        domain: fullDomain,
        primary_wallet_id: String(primaryWallet.id),
        asset_id: assetIdNorm.length === 64 ? assetIdNorm : undefined,
        content_mappings: {
          '/': {
            content: `<html><body>${fullDomain}</body></html>`,
            content_type: 'text/html',
          },
        },
      });
      const bound =
        assetIdNorm.length === 64
          ? `\nBound asset_id: ${assetIdNorm}`
          : '';
      Alert.alert(
        'Domain claimed',
        `${response.domain} registered.${bound}\nFee: ${DOMAIN_REGISTRATION_FEE_SOV} SOV.`,
        [{ text: 'OK', onPress: onBack }],
      );
    } catch (e: unknown) {
      // Domain fail must not imply launch rollback — launch is a separate tx.
      const msg = e instanceof Error ? e.message : 'Domain registration failed';
      Alert.alert(
        'Domain claim failed',
        `${msg}\n\nIf you already launched a DAO, that launch remains valid. You can retry with the same or a different name.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerWrap}>
        <SovSectionHeader
          title="Claim a .sov domain"
          subtitle="Separate DomainRegistration after AssetLaunch. Launch stays valid if this fails."
          onBack={onBack}
        />
      </View>

      <FormSection title="Domain label">
        <View style={styles.domainRow}>
          <UnderlineField
            value={domain}
            onChangeText={t => setDomain(sanitizeDomain(t))}
            placeholder="my-org"
            style={styles.domainInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.domainSuffix}>.sov</Text>
        </View>
        <Text style={styles.preview}>
          Full domain: <Text style={styles.previewMono}>{fullDomain}</Text>
        </Text>
      </FormSection>

      <FormSection title="Sovereign asset_id (optional)">
        <Text style={styles.smallNote}>
          64-CHAR HEX · NATIVE 32-BYTE ID · NO 0x PREFIX
        </Text>
        <TextInput
          value={assetId}
          onChangeText={setAssetId}
          placeholder="e7f56a6e… (from DAO launch)"
          placeholderTextColor={sovswapColors.paperInkFaint}
          style={[styles.textarea, styles.mono]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {assetIdNorm.length > 0 && !assetIdOk ? (
          <Text style={[styles.smallNote, { color: '#B00020' }]}>
            Must be exactly 64 hex characters
          </Text>
        ) : null}
        {assetIdOk && assetIdNorm.length === 64 ? (
          <Text style={styles.preview}>
            Binding: <Text style={styles.previewMono}>{assetIdNorm}</Text>
          </Text>
        ) : null}
      </FormSection>

      <View style={styles.feeCard}>
        <Text style={styles.feeKicker}>REGISTRATION FEE</Text>
        <Text style={styles.feeValue}>{DOMAIN_REGISTRATION_FEE_SOV} $SOV</Text>
        <Text style={styles.feeNote}>
          One-time, non-refundable. Paid from Primary wallet.
        </Text>
      </View>

      <Pressable
        onPress={() => {
          void submit();
        }}
        style={[styles.submitBtn, submitting ? { opacity: 0.6 } : null]}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>CLAIM DOMAIN →</Text>
        )}
      </Pressable>
    </ScrollView>
  );
};

/* ─── Form helpers ────────────────────────────────────────────────── */

const FormSection: React.FC<{
  /** Reserved for backwards-compat — no longer rendered. */
  no?: string;
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
    placeholderTextColor={sovswapColors.paperInkFaint}
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
        active ? { backgroundColor: accent.accent, borderColor: accent.accent } : null,
      ]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.radioTitle, active ? { color: accent.accent } : null]}>
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

const styles = createSovSwapStyles(() => StyleSheet.create({
  scroll: { paddingBottom: sovswapSpacing.xxxl },
  headerWrap: { paddingHorizontal: sovswapSpacing.lg },
  backBtn: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.md,
    paddingBottom: sovswapSpacing.sm,
    alignSelf: 'flex-start',
  },
  backText: {
    ...sovswapType.smallCapsInk,
    color: sovswapColors.paperInkSoft,
  },

  pickerIntro: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.lg,
    paddingBottom: sovswapSpacing.xs,
  },
  pickerIntroTitle: {
    ...sovswapType.daoTitle,
    fontSize: 20,
    marginBottom: 4,
  },
  pickerIntroText: {
    ...sovswapType.bodySoft,
    fontSize: 13,
    lineHeight: 18,
  },
  pickerCard: {
    backgroundColor: sovswapColors.paperWarm,
    marginTop: sovswapSpacing.md,
    marginHorizontal: sovswapSpacing.lg,
    borderRadius: 8,
    padding: sovswapSpacing.lg,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: {
    ...sovswapType.daoTitle,
    fontSize: 20,
    flex: 1,
    paddingRight: sovswapSpacing.sm,
  },
  pickerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: sovswapColors.paperInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerArrowGlyph: {
    color: sovswapColors.paper,
    fontSize: 16,
    fontWeight: '700',
  },
  pickerSubtitle: {
    ...sovswapType.bodySoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  pickerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: sovswapSpacing.md,
  },
  pickerChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: sovswapColors.paper,
  },
  pickerChipText: {
    ...sovswapType.smallCapsInk,
    fontSize: 10,
    color: sovswapColors.paperInkSoft,
  },
  pickerFooter: {
    marginTop: sovswapSpacing.md,
    alignItems: 'flex-end',
  },
  pickerCta: {
    ...sovswapType.smallCapsInk,
    color: sovswapColors.paperInk,
  },

  formSection: {
    backgroundColor: sovswapColors.paperWarm,
    marginHorizontal: sovswapSpacing.lg,
    marginTop: sovswapSpacing.md,
    paddingHorizontal: sovswapSpacing.lg,
    paddingVertical: sovswapSpacing.lg,
    borderRadius: 10,
  },
  formTitle: {
    ...sovswapType.smallCapsInk,
    fontSize: 11,
    color: sovswapColors.paperInkSoft,
    marginBottom: sovswapSpacing.md,
  },
  formBody: {
    // body is laid out by callers; the card already applies padding
  },

  underline: {
    fontSize: 16,
    color: sovswapColors.paperInk,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sovswapColors.ruleSoft,
  },

  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: sovswapSpacing.sm,
    paddingHorizontal: sovswapSpacing.sm,
    gap: sovswapSpacing.md,
    marginVertical: 2,
    borderRadius: 4,
  },
  radioActive: {
    backgroundColor: sovswapColors.paperWarm,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: sovswapColors.rule,
  },
  radioTitle: {
    ...sovswapType.smallCapsInk,
  },
  radioBlurb: {
    ...sovswapType.bodySoft,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sovswapSpacing.sm,
    paddingVertical: sovswapSpacing.sm,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: sovswapColors.rule,
  },
  checkboxOn: {
    backgroundColor: sovswapColors.paperInk,
  },
  checkLabel: {
    ...sovswapType.body,
    fontSize: 13,
  },

  sectorWrap: { paddingTop: sovswapSpacing.xs },
  sectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: sovswapSpacing.sm,
    marginTop: sovswapSpacing.xs,
    marginBottom: sovswapSpacing.md,
  },
  sectorCell: {
    width: '47%',
    borderWidth: 1,
    borderColor: sovswapColors.rule,
    paddingVertical: sovswapSpacing.sm,
    paddingHorizontal: sovswapSpacing.md,
  },
  sectorActive: {
    backgroundColor: sovswapColors.paperInk,
  },
  sectorLabel: { ...sovswapType.smallCapsInk, fontSize: 11 },
  sectorLabelActive: { color: sovswapColors.paper },
  sectorSymbol: {
    ...sovswapType.numeral,
    fontWeight: '700',
    marginTop: 2,
  },
  sectorSymbolActive: { color: sovswapColors.paper },
  smallNote: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInk,
    marginTop: sovswapSpacing.sm,
    marginBottom: sovswapSpacing.xs,
  },

  domainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  domainInput: { flex: 1 },
  domainSuffix: {
    ...sovswapType.numeral,
    color: sovswapColors.paperInkSoft,
    paddingBottom: 6,
    paddingLeft: 4,
  },
  preview: {
    ...sovswapType.bodySoft,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: sovswapSpacing.xs,
  },
  previewMono: {
    ...sovswapType.numeral,
    color: sovswapColors.paperInk,
    fontStyle: 'normal',
  },

  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: sovswapSpacing.sm,
    marginTop: sovswapSpacing.xs,
    marginBottom: sovswapSpacing.sm,
  },
  templateCell: {
    width: '47%',
    borderWidth: 1,
    borderColor: sovswapColors.rule,
    padding: sovswapSpacing.md,
    backgroundColor: sovswapColors.paper,
  },
  templateActive: {
    backgroundColor: sovswapColors.paperInk,
  },
  templateName: {
    ...sovswapType.daoTitle,
    fontSize: 16,
    color: sovswapColors.paperInk,
  },
  templateNameActive: { color: sovswapColors.paper },
  templateTag: {
    ...sovswapType.numeralSoft,
    fontSize: 10,
    marginTop: 2,
    fontWeight: '700',
  },
  templateDesc: {
    ...sovswapType.bodySoft,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: sovswapSpacing.xs,
  },

  customWrap: {
    paddingTop: sovswapSpacing.sm,
  },

  textarea: {
    fontSize: 15,
    color: sovswapColors.paperInk,
    paddingHorizontal: sovswapSpacing.sm,
    paddingTop: sovswapSpacing.sm,
    paddingBottom: sovswapSpacing.sm,
    minHeight: 96,
    backgroundColor: sovswapColors.paperWarm,
    borderWidth: 1,
    borderColor: sovswapColors.ruleSoft,
    textAlignVertical: 'top',
  },
  mono: {
    fontSize: 13,
  },

  previewLine: {
    paddingVertical: sovswapSpacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: sovswapColors.ruleSoft,
  },
  previewLabel: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInkSoft,
    marginBottom: 4,
  },
  previewValue: {
    ...sovswapType.numeral,
    fontSize: 15,
    fontWeight: '600',
  },

  submitBtn: {
    marginHorizontal: sovswapSpacing.lg,
    marginTop: sovswapSpacing.xl,
    backgroundColor: sovswapColors.paperInk,
    paddingVertical: sovswapSpacing.md,
    alignItems: 'center',
  },
  submitText: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paper,
    letterSpacing: 1.6,
    fontSize: 13,
  },

  feeCard: {
    marginHorizontal: sovswapSpacing.lg,
    marginTop: sovswapSpacing.lg,
    paddingVertical: sovswapSpacing.md,
    paddingHorizontal: sovswapSpacing.lg,
    backgroundColor: sovswapColors.paperWarm,
    alignItems: 'center',
    borderRadius: 6,
  },
  feeKicker: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInk,
  },
  feeValue: {
    ...sovswapType.priceLg,
    fontSize: 32,
    marginTop: 4,
  },
  feeNote: {
    ...sovswapType.bodySoft,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },

  daoPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: sovswapSpacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sovswapColors.ruleSoft,
    gap: sovswapSpacing.sm,
  },
  daoPickerLabel: { ...sovswapType.smallCaps, color: sovswapColors.paperInk },
  daoPickerValue: { flex: 1, ...sovswapType.body, fontStyle: 'italic' },
  daoPickerArrow: {
    fontSize: 12,
    color: sovswapColors.paperInkSoft,
  },

  pickerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26, 22, 20, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: sovswapSpacing.lg,
  },
  pickerSheet: {
    backgroundColor: sovswapColors.paper,
    borderRadius: 6,
    paddingVertical: sovswapSpacing.sm,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sovswapSpacing.md,
    paddingVertical: sovswapSpacing.sm,
    paddingHorizontal: sovswapSpacing.lg,
  },
  pickerItemActive: { backgroundColor: sovswapColors.paperWarm },
  pickerItemSymbol: {
    fontSize: 16,
    fontWeight: '700',
    color: sovswapColors.paperInk,
  },
  pickerItemName: { ...sovswapType.bodySoft, fontStyle: 'italic' },
}));

export default CreateDaoTab;
