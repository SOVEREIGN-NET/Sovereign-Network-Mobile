import React, { useState } from 'react';
import { View, Alert, Pressable } from 'react-native';
import {
  Card,
  Text,
  Button,
  FormField,
  Column,
  LoadingView,
  ScreenLayout,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

type ProposalType = 'technical' | 'funding' | 'governance' | 'parameter';

interface CreateProposalData {
  title: string;
  description: string;
  type: ProposalType;
  fundingAmount?: number;
  budgetCategory?: string;
  parameterName?: string;
  currentValue?: string;
  proposedValue?: string;
}

const CreateProposalScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();

  const PROPOSAL_TYPES: { value: ProposalType; label: string; emoji: string }[] = [
    { value: 'technical', label: t.dao.createProposal.proposalTypes.technical.label, emoji: t.dao.createProposal.proposalTypes.technical.emoji },
    { value: 'funding', label: t.dao.createProposal.proposalTypes.funding.label, emoji: t.dao.createProposal.proposalTypes.funding.emoji },
    { value: 'governance', label: t.dao.createProposal.proposalTypes.governance.label, emoji: t.dao.createProposal.proposalTypes.governance.emoji },
    { value: 'parameter', label: t.dao.createProposal.proposalTypes.parameter.label, emoji: t.dao.createProposal.proposalTypes.parameter.emoji },
  ];

  const BUDGET_CATEGORIES = t.dao.createProposal.budgetCategories;

  const [proposalType, setProposalType] = useState<ProposalType>('technical');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fundingAmount, setFundingAmount] = useState('');
  const [budgetCategory] = useState(BUDGET_CATEGORIES[0] || 'Infrastructure');
  const [parameterName, setParameterName] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [proposedValue, setProposedValue] = useState('');
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  const validateForm = (): boolean => {
    setError(null);

    if (!title.trim()) {
      setError(t.dao.createProposal.validation.titleRequired);
      return false;
    }

    if (title.trim().length < 5) {
      setError(t.dao.createProposal.validation.titleTooShort);
      return false;
    }

    if (!description.trim()) {
      setError(t.dao.createProposal.validation.descriptionRequired);
      return false;
    }

    if (description.trim().length < 20) {
      setError(t.dao.createProposal.validation.descriptionTooShort);
      return false;
    }

    if (proposalType === 'funding') {
      if (!fundingAmount || Number.parseFloat(fundingAmount) <= 0) {
        setError(t.dao.createProposal.validation.fundingAmountRequired);
        return false;
      }
    }

    if (proposalType === 'parameter') {
      if (!parameterName.trim()) {
        setError(t.dao.createProposal.validation.parameterNameRequired);
        return false;
      }
      if (!proposedValue.trim()) {
        setError(t.dao.createProposal.validation.proposedValueRequired);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Simulate creating proposal
      await new Promise(resolve => setTimeout(resolve, 1000));

      const proposalData: CreateProposalData = {
        title: title.trim(),
        description: description.trim(),
        type: proposalType,
      };

      if (proposalType === 'funding') {
        proposalData.fundingAmount = Number.parseFloat(fundingAmount);
        proposalData.budgetCategory = budgetCategory;
      }

      if (proposalType === 'parameter') {
        proposalData.parameterName = parameterName.trim();
        proposalData.currentValue = currentValue.trim();
        proposalData.proposedValue = proposedValue.trim();
      }

      // In a real app, this would call the backend
      console.log('Creating proposal:', proposalData);

      Alert.alert(
        t.dao.createProposal.success.title,
        t.dao.createProposal.success.message,
        [
          {
            text: t.dao.createProposal.success.button,
            onPress: () => navigation?.goBack(),
          },
        ]
      );
    } catch (err: any) {
      setError(err.message || t.dao.createProposal.errors.submitFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTypeInfo = PROPOSAL_TYPES.find(t => t.value === proposalType);

  return (
    <ScreenLayout>
      <Column gap="xl">
          {/* Error Message */}
          {error && (
            <View
              style={{
                backgroundColor: colors.error,
                padding: spacing.md,
                borderRadius: borderRadius.base,
              }}
            >
              <Text style={{ color: colors.white }}>❌ {error}</Text>
            </View>
          )}

          {/* Proposal Type Selector */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.dao.createProposal.proposalType}
            </Text>

            <Pressable
              onPress={() => setShowTypeSelector(!showTypeSelector)}
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderWidth: 2,
                borderColor: colors.primary,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.base,
                  color: colors.text_primary,
                }}
              >
                {selectedTypeInfo?.emoji} {selectedTypeInfo?.label}
              </Text>
              <Text style={{ fontSize: typography.size.xl, color: colors.primary }}>
                {showTypeSelector ? '▲' : '▼'}
              </Text>
            </Pressable>

            {showTypeSelector && (
              <Column gap="sm" style={{ marginTop: spacing.md }}>
                {PROPOSAL_TYPES.map(type => (
                  <Pressable
                    key={type.value}
                    onPress={() => {
                      setProposalType(type.value);
                      setShowTypeSelector(false);
                      setError(null);
                    }}
                    style={{
                      backgroundColor:
                        proposalType === type.value ? colors.primary : colors.bg_darker,
                      padding: spacing.md,
                      borderRadius: borderRadius.base,
                      borderWidth: 1,
                      borderColor: proposalType === type.value ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          proposalType === type.value ? colors.white : colors.text_primary,
                        fontSize: typography.size.sm,
                      }}
                    >
                      {type.emoji} {type.label}
                    </Text>
                  </Pressable>
                ))}
              </Column>
            )}
          </Card>

          {/* Title Input */}
          <FormField
            label={t.dao.createProposal.title}
            placeholder={t.dao.createProposal.titlePlaceholder}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            editable={!isSubmitting}
            helperText={t.dao.createProposal.titleCounter.replace('{current}', title.length.toString())}
          />

          {/* Description Input */}
          <FormField
            label={t.dao.createProposal.description}
            placeholder={t.dao.createProposal.descriptionPlaceholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            maxLength={500}
            editable={!isSubmitting}
            helperText={t.dao.createProposal.descriptionCounter.replace('{current}', description.length.toString())}
          />

          {/* Funding Type Fields */}
          {proposalType === 'funding' && (
            <>
              <Card>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                    marginBottom: spacing.md,
                  }}
                >
                  {t.dao.createProposal.budgetCategory}
                </Text>
                <Pressable
                  onPress={() => {}}
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text_primary }}>
                    {budgetCategory}
                  </Text>
                </Pressable>
              </Card>

              <FormField
                label={t.dao.createProposal.fundingAmount}
                placeholder="0.00"
                value={fundingAmount}
                onChangeText={setFundingAmount}
                keyboardType="decimal-pad"
                editable={!isSubmitting}
                helperText={t.dao.createProposal.fundingUnit}
              />
            </>
          )}

          {/* Parameter Type Fields */}
          {proposalType === 'parameter' && (
            <>
              <FormField
                label={t.dao.createProposal.parameterName}
                placeholder={t.dao.createProposal.parameterNamePlaceholder}
                value={parameterName}
                onChangeText={setParameterName}
                editable={!isSubmitting}
              />

              <Card>
                <Column gap="md">
                  <FormField
                    label={t.dao.createProposal.currentValue}
                    placeholder={t.dao.createProposal.currentValuePlaceholder}
                    value={currentValue}
                    onChangeText={setCurrentValue}
                    editable={!isSubmitting}
                    containerStyle={{ marginBottom: 0 }}
                  />

                  <FormField
                    label={t.dao.createProposal.proposedValue}
                    placeholder={t.dao.createProposal.proposedValuePlaceholder}
                    value={proposedValue}
                    onChangeText={setProposedValue}
                    editable={!isSubmitting}
                    containerStyle={{ marginBottom: 0 }}
                  />
                </Column>
              </Card>
            </>
          )}

          {/* Info Card */}
          <Card>
            <View
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  fontWeight: typography.weight.semibold,
                  color: colors.info,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.createProposal.info.title}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  lineHeight: typography.size.sm * 1.5,
                }}
              >
                {t.dao.createProposal.info.description}
              </Text>
            </View>
          </Card>

          {/* Action Buttons */}
          <Column gap="sm">
            <Button
              onPress={handleSubmit}
              disabled={isSubmitting || isLoading}
              style={{
                opacity: isSubmitting || isLoading ? 0.6 : 1,
              }}
            >
              {isSubmitting ? t.dao.createProposal.submittingButton : t.dao.createProposal.submitButton}
            </Button>
            <Button
              variant="outline"
              onPress={() => navigation?.goBack()}
              disabled={isSubmitting || isLoading}
            >
              {t.dao.createProposal.cancelButton}
            </Button>
          </Column>

        {/* Footer spacing */}
        <View style={{ height: spacing.xl }} />
      </Column>
    </ScreenLayout>
  );
};

export default CreateProposalScreen;
